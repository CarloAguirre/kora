import { useEffect, useState } from 'react';
import {
  HOUR_ENTRY_STATUSES,
  HOUR_ENTRY_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type HourEntryStatus,
  type HourEntrySummary,
  type ProjectStatus,
} from '@kora/contracts';
import styles from './TeamHourHistoryPanel.module.css';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Badge } from '@/shared/components/ui/Badge';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, DownloadIcon, SearchIcon } from '@/shared/components/icons/Icons';
import { HourEntryStatusBadge } from './HourEntryStatusBadge';
import { HourEntryFormDialog } from './HourEntryFormDialog';
import { useDeleteHourEntry, useHourEntriesList } from '../api/hours.queries';
import { useHourEntriesExport } from '../hooks/useHourEntriesExport';
import { resolvedApprover } from '../lib/approver';
import { useAuth } from '@/modules/auth/hooks/useAuth';

const STATUS_OPTIONS = HOUR_ENTRY_STATUSES.map((status) => ({ value: status, label: HOUR_ENTRY_STATUS_LABELS[status] }));
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type DialogState = { kind: 'none' } | { kind: 'view' | 'edit'; entry: HourEntrySummary | null };

/**
 * "Registro de horas Líder" — réplica del card homónimo de `LiderDashboardB`
 * (v1): botón para que el líder registre sus propias horas, y debajo el
 * historial de TODO el equipo (no solo el propio) con filtro por persona,
 * fecha y estado. La visibilidad viene gratis del alcance `hours:read_team`
 * ya resuelto en el backend (propias + del equipo liderado).
 *
 * Editar/eliminar solo están disponibles sobre los registros propios: a
 * diferencia de la v1, el backend de v2 no permite que un líder modifique el
 * registro de otro colaborador (solo su dueño o admin/PMO) — ver "Ver" para
 * los ajenos. Sobre los propios: Editar no depende del estado (el backend lo
 * permite en cualquier estado para el dueño), Eliminar sí — un registro
 * aprobado ya afectó el consumo del proyecto y el backend rechaza borrarlo.
 */
export function TeamHourHistoryPanel({ teamId, userId }: { teamId?: string; userId?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [personSearch, setPersonSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<HourEntryStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const { exporting, exportError, exportEntries } = useHourEntriesExport();
  const deleteEntry = useDeleteHourEntry();

  const hasFilters = Boolean(personSearch || dateFrom || dateTo || status);

  useEffect(() => {
    setPage(1);
  }, [teamId, userId]);

  const { data, isLoading, error } = useHourEntriesList({
    search: personSearch.trim() || undefined,
    teamId,
    userId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: status || undefined,
    page,
    pageSize: 10,
    sortField: 'date',
    sortDirection: 'desc',
  });

  const clearFilters = () => {
    setPersonSearch('');
    setDateFrom('');
    setDateTo('');
    setStatus('');
    setPage(1);
  };

  const closeDialog = () => setDialog({ kind: 'none' });

  const handleDelete = async (entry: HourEntrySummary) => {
    await deleteEntry.mutateAsync(entry.id);
    toast.success('Se eliminó el registro de horas.');
  };

  const handleExport = () =>
    exportEntries({
      search: personSearch.trim() || undefined,
      teamId,
      userId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: status || undefined,
      sortField: 'date',
      sortDirection: 'desc',
    });

  const columns: Column<HourEntrySummary>[] = [
    { key: 'date', header: 'Fecha', render: (e) => formatDate(e.date) },
    { key: 'author', header: 'Autor', render: (e) => e.user.fullName },
    { key: 'team', header: 'Equipo', render: (e) => e.team?.name ?? <span className={styles.empty}>—</span> },
    { key: 'project', header: 'Proyecto', render: (e) => e.project?.name ?? <span className={styles.empty}>—</span> },
    { key: 'assignment', header: 'Asignación', render: (e) => e.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (e) => e.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'Horas', align: 'right', render: (e) => formatHours(e.hours) },
    {
      key: 'overtime',
      header: 'Horas Extra',
      render: (e) => (e.isOvertime ? <Badge tone="warning">Extra</Badge> : <span className={styles.empty}>—</span>),
    },
    {
      key: 'projectStage',
      header: 'Estado',
      render: (e) =>
        e.projectStageAtEntry ? PROJECT_STATUS_LABELS[e.projectStageAtEntry as ProjectStatus] : <span className={styles.empty}>—</span>,
    },
    { key: 'description', header: 'Comentario', render: (e) => e.description || <span className={styles.empty}>—</span> },
    {
      key: 'approver',
      header: 'Aprobado por',
      render: (e) => resolvedApprover(e)?.fullName ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'status',
      header: 'Estado de aprobación',
      render: (e) => (
        <div className={styles.statusCell}>
          <HourEntryStatusBadge status={e.status} />
          {e.status === 'rejected' && e.rejectionReason && <span className={styles.rejectionReason}>Motivo: {e.rejectionReason}</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '120px',
      render: (e) => {
        const isOwner = e.user.id === user?.id;
        return (
          <div className={styles.actions}>
            <Button variant="ghost" size="icon" onClick={() => setDialog({ kind: 'view', entry: e })} aria-label="Ver" title="Ver">
              <EyeIcon size={16} />
            </Button>
            {isOwner && (
              <Button variant="ghost" size="icon" onClick={() => setDialog({ kind: 'edit', entry: e })} aria-label="Editar" title="Editar">
                <PencilIcon size={16} />
              </Button>
            )}
            {isOwner && e.status !== 'approved' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleDelete(e)}
                aria-label="Eliminar"
                title="Eliminar"
                className={styles.dangerAction}
              >
                <TrashIcon size={16} />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <p className={styles.subtitle}>{data ? `${data.total} registro${data.total === 1 ? '' : 's'}` : ' '}</p>
        <div className={styles.headerActions}>
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={18} />}
            loading={exporting}
            loadingText="Generando…"
            onClick={() => void handleExport()}
          >
            Descargar registro de horas
          </Button>
          <Button iconLeft={<PlusIcon size={18} />} onClick={() => setDialog({ kind: 'edit', entry: null })}>
            Registrar horas
          </Button>
        </div>
      </div>

      {exportError && (
        <p className={styles.exportError} role="alert">
          {exportError}
        </p>
      )}

      <h3 className={styles.sectionTitle}>Historial Reciente</h3>

      <div className={styles.filters}>
        <TextField
          className={styles.filter}
          label="Persona"
          type="search"
          placeholder="Buscar por nombre"
          value={personSearch}
          onChange={(event) => {
            setPersonSearch(event.target.value);
            setPage(1);
          }}
          iconLeft={<SearchIcon size={16} />}
        />
        <TextField
          className={styles.filter}
          label="Fecha HH desde"
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
        />
        <TextField
          className={styles.filter}
          label="Fecha HH hasta"
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
        />
        <Select
          className={styles.filter}
          label="Estado"
          placeholder="Todos"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as HourEntryStatus | '');
            setPage(1);
          }}
        />
        {hasFilters && (
          <Button className={styles.reset} variant="tertiary" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <DataTable
        caption="Historial de horas del equipo"
        columns={columns}
        items={data?.items ?? []}
        getRowKey={(entry) => entry.id}
        loading={isLoading}
        error={error ? 'No se pudo cargar el historial de horas.' : null}
        emptyMessage="No hay registros para los filtros aplicados."
      />

      {data && <Pagination page={page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />}

      <HourEntryFormDialog
        open={dialog.kind !== 'none'}
        entry={dialog.kind === 'none' ? null : dialog.entry}
        readOnly={dialog.kind === 'view'}
        onClose={closeDialog}
        onSuccess={(message) => {
          toast.success(message);
          closeDialog();
        }}
      />
    </div>
  );
}
