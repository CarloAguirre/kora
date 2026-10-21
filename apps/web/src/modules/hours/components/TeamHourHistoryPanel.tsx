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
import { DropdownMenu, type DropdownMenuItem } from '@/shared/components/ui/DropdownMenu';
import { Modal } from '@/shared/components/ui/Modal';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Badge } from '@/shared/components/ui/Badge';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { DownloadIcon, SearchIcon } from '@/shared/components/icons/Icons';
import { HourEntryStatusBadge } from './HourEntryStatusBadge';
import { HourEntryFormDialog } from './HourEntryFormDialog';
import { useApproveHourEntry, useDeleteHourEntry, useHourEntriesList, useRejectHourEntry } from '../api/hours.queries';
import { useHourEntriesExport } from '../hooks/useHourEntriesExport';
import { resolvedApprover } from '../lib/approver';
import { isInCurrentMonth } from '../lib/edit-window';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { getProjectOptionLabel } from '@/modules/projects/lib/project-option-label';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';

const STATUS_OPTIONS = HOUR_ENTRY_STATUSES.map((status) => ({ value: status, label: HOUR_ENTRY_STATUS_LABELS[status] }));
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type DialogState = { kind: 'none' } | { kind: 'view' | 'edit'; entry: HourEntrySummary | null };

/**
 * "Registro de horas Líder" — réplica del card homónimo de `LiderDashboardB`
 * (v1), sin el botón "Registrar horas" que tenía allá (se sacó por diseño):
 * el historial de TODO el equipo (no solo el propio) con filtro por persona,
 * proyecto, fecha y estado. La visibilidad viene gratis del alcance `hours:read_team`
 * ya resuelto en el backend (propias + del equipo liderado).
 *
 * Las acciones de cada fila van en un menú ⋮ (mismo patrón que la cola de
 * `/horas/aprobaciones`) y siguen las reglas del backend. Editar lo puede el
 * dueño o un admin/PMO (pendiente o rechazado) y quien aprueba (pendiente o
 * aprobado — la corrección de un aprobado lo deja aprobado). Eliminar: el
 * dueño o un admin/PMO si no está aprobado; un aprobado, solo quien lo aprueba
 * (el backend recalcula el consumo del proyecto). Editar y eliminar, salvo
 * admin/PMO (que pueden con cualquier registro), solo dentro del mes en curso. Aprobar/Rechazar solo
 * aplica a pendientes; si el actor no es el aprobador de ese registro, el
 * backend lo rechaza y se muestra su mensaje.
 */
export function TeamHourHistoryPanel({ teamId, userId }: { teamId?: string; userId?: string }) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const toast = useToast();
  const [personSearch, setPersonSearch] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<HourEntryStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const { exporting, exportError, exportEntries } = useHourEntriesExport();
  const deleteEntry = useDeleteHourEntry();
  const approveEntry = useApproveHourEntry();
  const rejectEntry = useRejectHourEntry();
  const [rejecting, setRejecting] = useState<HourEntrySummary | null>(null);
  const [deleting, setDeleting] = useState<HourEntrySummary | null>(null);
  const [reason, setReason] = useState('');
  const canApprove = can('hours:approve');
  const isAdminLike = user?.role === 'admin' || user?.role === 'pmo';

  const hasFilters = Boolean(personSearch || projectIds.length || dateFrom || dateTo || status);

  // Las opciones de proyecto dependen del equipo/colaborador: al cambiarlos se sueltan los proyectos elegidos.
  useEffect(() => {
    setProjectIds([]);
    setPage(1);
  }, [teamId, userId]);

  const { data: projects } = useProjectsList({
    page: 1,
    pageSize: 200,
    sortField: 'name',
    sortDirection: 'asc',
    teamId,
    assignedToUserId: userId,
  });
  const projectOptions = (projects?.items ?? []).map((project) => ({ value: project.id, label: getProjectOptionLabel(project) }));

  const { data, isLoading, error } = useHourEntriesList({
    search: personSearch.trim() || undefined,
    teamId,
    userId,
    projectIds: projectIds.length ? projectIds : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: status || undefined,
    page,
    pageSize,
    sortField: 'date',
    sortDirection: 'desc',
  });

  const clearFilters = () => {
    setPersonSearch('');
    setProjectIds([]);
    setDateFrom('');
    setDateTo('');
    setStatus('');
    setPage(1);
  };

  const closeDialog = () => setDialog({ kind: 'none' });

  const showError = (error: unknown, fallback: string) =>
    toast.error(error instanceof ApiRequestError ? error.message : fallback);

  // Sin try/catch: si falla, `ConfirmActionDialog` queda abierto y muestra el error.
  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteEntry.mutateAsync(deleting.id);
    toast.success('Se eliminó el registro de horas.');
  };

  const handleApprove = async (entry: HourEntrySummary) => {
    try {
      await approveEntry.mutateAsync(entry.id);
    } catch (error) {
      showError(error, 'No se pudo aprobar el registro.');
      return;
    }
    toast.success('Registro aprobado.');
  };

  const closeReject = () => {
    setRejecting(null);
    setReason('');
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    try {
      await rejectEntry.mutateAsync({ entryId: rejecting.id, input: { reason } });
    } catch (error) {
      showError(error, 'No se pudo rechazar el registro.');
      return;
    }
    toast.success('Registro rechazado.');
    closeReject();
  };

  const rowActions = (e: HourEntrySummary): DropdownMenuItem[] => {
    const isOwner = e.user.id === user?.id;
    const isPending = e.status === 'pending';
    const isApproved = e.status === 'approved';
    const inCurrentMonth = isInCurrentMonth(e.date);
    const canEdit = isAdminLike || (inCurrentMonth && ((isOwner && !isApproved) || (canApprove && (isPending || isApproved))));
    const canDecide = canApprove && isPending;
    const canDelete = isAdminLike || (inCurrentMonth && (isApproved ? canApprove : isOwner));
    return [
      { key: 'ver', label: 'Ver detalle', onSelect: () => setDialog({ kind: 'view', entry: e }) },
      ...(canEdit ? [{ key: 'editar', label: 'Editar', onSelect: () => setDialog({ kind: 'edit', entry: e }) }] : []),
      ...(canDecide
        ? [
            { key: 'aprobar', label: 'Aprobar', tone: 'success' as const, onSelect: () => void handleApprove(e) },
            { key: 'rechazar', label: 'Rechazar', tone: 'danger' as const, onSelect: () => setRejecting(e) },
          ]
        : []),
      ...(canDelete
        ? [{ key: 'eliminar', label: 'Eliminar', tone: 'danger' as const, onSelect: () => setDeleting(e) }]
        : []),
    ];
  };

  const handleExport = () =>
    exportEntries({
      search: personSearch.trim() || undefined,
      teamId,
      userId,
      projectIds: projectIds.length ? projectIds : undefined,
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
      header: 'Acciones',
      align: 'right',
      width: '80px',
      render: (e) => (
        <div className={styles.actions}>
          <DropdownMenu
            items={rowActions(e)}
            trigger={({ onClick }) => (
              <Button variant="ghost" size="icon" onClick={onClick} aria-label={`Acciones — ${e.user.fullName}`} title="Acciones">
                ⋮
              </Button>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>Historial Reciente</h2>
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
        </div>
      </div>

      {exportError && (
        <p className={styles.exportError} role="alert">
          {exportError}
        </p>
      )}

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
        <MultiSelect
          className={styles.filter}
          label="Proyecto"
          placeholder="Todos"
          searchPlaceholder="Buscar proyecto"
          options={projectOptions}
          value={projectIds}
          onChange={(nextProjectIds) => {
            setProjectIds(nextProjectIds);
            setPage(1);
          }}
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

      {data && (
        <Pagination
          page={page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

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

      <ConfirmActionDialog
        open={deleting !== null}
        title="Eliminar registro de horas"
        description={
          deleting
            ? `Se eliminarán ${formatHours(deleting.hours)} h de ${deleting.user.fullName} del ${formatDate(deleting.date)}. Esta acción no se puede deshacer.`
            : ''
        }
        warning={deleting?.status === 'approved' ? 'El registro ya está aprobado: se descontará del consumo del proyecto.' : null}
        confirmLabel="Eliminar"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <Modal open={rejecting !== null} title="Rechazar registro de horas" onClose={closeReject}>
        <div className={styles.rejectForm}>
          <TextField
            label="Motivo del rechazo"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por qué se rechaza este registro"
          />
          <div className={styles.rejectActions}>
            <Button variant="outline" onClick={closeReject}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={!reason.trim()} loading={rejectEntry.isPending} onClick={() => void confirmReject()}>
              Rechazar registro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
