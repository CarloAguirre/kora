import { useState } from 'react';
import type { HourEntrySummary, ListHourEntriesQuery } from '@kora/contracts';
import styles from './HourEntriesApprovalTable.module.css';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Modal } from '@/shared/components/ui/Modal';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { CheckIcon, CloseIcon } from '@/shared/components/icons/Icons';
import { useApproveHourEntry, useHourEntriesList, useRejectHourEntry } from '../api/hours.queries';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Tabla de horas pendientes de aprobación con selección y acciones masivas.
 * La usan tanto `/horas/aprobaciones` (todo lo que el actor puede aprobar)
 * como la ficha de colaborador (acotada a un `userId`) — misma lógica de
 * selección/aprobación/rechazo, distinto alcance de datos.
 */
export function HourEntriesApprovalTable({
  query,
  emptyMessage = 'No hay horas pendientes de aprobación.',
  showTeamColumn = true,
  showUserColumn = true,
}: {
  query: Partial<ListHourEntriesQuery>;
  emptyMessage?: string;
  showTeamColumn?: boolean;
  showUserColumn?: boolean;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const { data, isLoading, error } = useHourEntriesList({ status: 'pending', page: 1, pageSize: 100, sortField: 'date', ...query });
  const approveEntry = useApproveHourEntry();
  const rejectEntry = useRejectHourEntry();

  const entries = data?.items ?? [];
  const allSelected = entries.length > 0 && entries.every((entry) => selected.has(entry.id));
  const selectedHours = entries.filter((entry) => selected.has(entry.id)).reduce((sum, entry) => sum + entry.hours, 0);

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.map((entry) => entry.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approveOne = async (entry: HourEntrySummary) => {
    await approveEntry.mutateAsync(entry.id);
    toast.success('Registro aprobado.');
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
  };

  const approveSelected = async () => {
    const ids = [...selected];
    for (const id of ids) await approveEntry.mutateAsync(id);
    toast.success(`${ids.length} registro${ids.length === 1 ? '' : 's'} aprobado${ids.length === 1 ? '' : 's'}.`);
    setSelected(new Set());
  };

  const confirmReject = async () => {
    const ids = [...selected];
    for (const id of ids) await rejectEntry.mutateAsync({ entryId: id, input: { reason } });
    toast.success(`${ids.length} registro${ids.length === 1 ? '' : 's'} rechazado${ids.length === 1 ? '' : 's'}.`);
    setSelected(new Set());
    setReason('');
    setRejecting(false);
  };

  const columns: Column<HourEntrySummary>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (entry) => (
        <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleOne(entry.id)} aria-label={`Seleccionar ${entry.user.fullName}`} />
      ),
    },
    { key: 'date', header: 'Fecha', render: (entry) => formatDate(entry.date) },
    ...(showUserColumn
      ? [{ key: 'user', header: 'Colaborador', render: (entry: HourEntrySummary) => entry.user.fullName } satisfies Column<HourEntrySummary>]
      : []),
    ...(showTeamColumn
      ? [
          {
            key: 'team',
            header: 'Equipo',
            render: (entry: HourEntrySummary) => entry.team?.name ?? <span className={styles.empty}>—</span>,
          } satisfies Column<HourEntrySummary>,
        ]
      : []),
    { key: 'project', header: 'Proyecto', render: (entry) => entry.project?.name ?? <span className={styles.empty}>—</span> },
    { key: 'assignment', header: 'Asignación', render: (entry) => entry.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (entry) => entry.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'HH registradas', align: 'right', render: (entry) => formatHours(entry.hours) },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '90px',
      render: (entry) => (
        <div className={styles.rowActions}>
          <Button variant="ghost" size="icon" onClick={() => void approveOne(entry)} aria-label="Aprobar" title="Aprobar">
            <CheckIcon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelected(new Set([entry.id]));
              setRejecting(true);
            }}
            aria-label="Rechazar"
            title="Rechazar"
            className={styles.dangerAction}
          >
            <CloseIcon size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.wrapper}>
      {entries.length > 0 && (
        <button type="button" className={styles.selectAll} onClick={toggleAll}>
          {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
        </button>
      )}

      <DataTable
        caption="Horas pendientes de aprobación"
        columns={columns}
        items={entries}
        getRowKey={(entry) => entry.id}
        loading={isLoading}
        error={error ? 'No se pudo cargar la cola de aprobación.' : null}
        emptyMessage={emptyMessage}
      />

      <div className={styles.bulkBar}>
        <span className={styles.bulkSummary} aria-live="polite">
          {selected.size > 0 ? `Seleccionadas: ${selected.size} · ${formatHours(selectedHours)} hrs` : ''}
        </span>
        <Button variant="outlineDark" disabled={selected.size === 0} onClick={() => setRejecting(true)}>
          Rechazar las HH seleccionadas
        </Button>
        <Button disabled={selected.size === 0} onClick={() => void approveSelected()}>
          Aprobar las HH seleccionadas
        </Button>
      </div>

      <Modal open={rejecting} title="Rechazar registros de horas" onClose={() => setRejecting(false)}>
        <div className={styles.rejectForm}>
          <TextField
            label="Motivo del rechazo"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por qué se rechazan estos registros"
          />
          <div className={styles.rejectActions}>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={!reason.trim()} onClick={() => void confirmReject()}>
              Rechazar {selected.size} registro{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
