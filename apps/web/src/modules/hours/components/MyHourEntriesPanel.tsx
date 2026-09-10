import { useState } from 'react';
import { HOUR_ENTRY_STATUSES, HOUR_ENTRY_STATUS_LABELS, type HourEntryStatus, type HourEntrySummary } from '@kora/contracts';
import styles from './MyHourEntriesPanel.module.css';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Select } from '@/shared/components/ui/Select';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { Badge } from '@/shared/components/ui/Badge';
import { HourEntryStatusBadge } from './HourEntryStatusBadge';
import { HourEntryFormDialog } from './HourEntryFormDialog';
import { useDeleteHourEntry, useHourEntriesList } from '../api/hours.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';

const STATUS_OPTIONS = HOUR_ENTRY_STATUSES.map((status) => ({ value: status, label: HOUR_ENTRY_STATUS_LABELS[status] }));
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type DialogState = { kind: 'none' } | { kind: 'form'; entry: HourEntrySummary | null };

/**
 * Registro de horas propio: alta, historial y edición del actor autenticado.
 * Es el mismo panel que usa `/horas` — aquí se reutiliza embebido en la
 * consola de equipo del líder ("Registro de horas Líder" en la v1), en vez
 * de reconstruirlo o dejarlo detrás de un enlace.
 */
export function MyHourEntriesPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<HourEntryStatus | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const deleteEntry = useDeleteHourEntry();

  const { data, isLoading, error } = useHourEntriesList({
    userId: user?.id,
    status: status || undefined,
    page,
    pageSize: 10,
  });

  const closeDialog = () => setDialog({ kind: 'none' });

  const handleDelete = async (entry: HourEntrySummary) => {
    await deleteEntry.mutateAsync(entry.id);
    toast.success('Se eliminó el registro de horas.');
  };

  const columns: Column<HourEntrySummary>[] = [
    { key: 'date', header: 'Fecha', render: (e) => formatDate(e.date) },
    { key: 'project', header: 'Proyecto', render: (e) => e.project?.name ?? <span className={styles.empty}>—</span> },
    { key: 'assignment', header: 'Asignación', render: (e) => e.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (e) => e.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'Horas', render: (e) => formatHours(e.hours) },
    {
      key: 'overtime',
      header: 'Horas Extra',
      render: (e) => (e.isOvertime ? <Badge tone="warning">Extra</Badge> : <span className={styles.empty}>—</span>),
    },
    {
      key: 'status',
      header: 'Estado',
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
      width: '90px',
      render: (e) =>
        e.status !== 'approved' ? (
          <div className={styles.actions}>
            <Button variant="ghost" size="icon" onClick={() => setDialog({ kind: 'form', entry: e })} aria-label="Editar" title="Editar">
              <PencilIcon size={16} />
            </Button>
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
          </div>
        ) : null,
    },
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <p className={styles.subtitle}>{data ? `${data.total} registro${data.total === 1 ? '' : 's'}` : ' '}</p>
        <Button iconLeft={<PlusIcon size={18} />} onClick={() => setDialog({ kind: 'form', entry: null })}>
          Registrar horas
        </Button>
      </div>

      <div className={styles.filters}>
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
      </div>

      <DataTable
        caption="Historial de horas"
        columns={columns}
        items={data?.items ?? []}
        getRowKey={(entry) => entry.id}
        loading={isLoading}
        error={error ? 'No se pudo cargar el historial de horas.' : null}
        emptyMessage="No hay registros para los filtros aplicados."
      />

      {data && <Pagination page={page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />}

      <HourEntryFormDialog
        open={dialog.kind === 'form'}
        entry={dialog.kind === 'form' ? dialog.entry : null}
        onClose={closeDialog}
        onSuccess={(message) => {
          toast.success(message);
          closeDialog();
        }}
      />
    </div>
  );
}
