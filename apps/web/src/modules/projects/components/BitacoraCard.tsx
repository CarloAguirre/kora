import { useMemo, useState } from 'react';
import {
  PROJECT_OBSERVATION_STATUS_LABELS,
  PROJECT_OBSERVATION_TYPE_LABELS,
  type HourEntrySummary,
  type ProjectModule,
  type ProjectObservation,
} from '@kora/contracts';
import styles from './BitacoraCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { TextField } from '@/shared/components/ui/TextField';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { CloseIcon, EyeIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useDeleteProjectObservation, useUpdateProjectObservation } from '../api/projects.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { EVENT_STATUS_LABEL, formatEntryHours } from '../lib/hour-entry-log';
import {
  rowDateDisplay,
  rowFilterDate,
  rowId,
  rowIsIncident,
  rowPhase,
  rowResponsible,
  rowStatusBadge,
  rowTitle,
  rowTooltip,
  rowTypeBadge,
  toBitacoraRows,
  type BitacoraRow,
} from '../lib/bitacora-row';
import { AddBitacoraRecordModal } from './AddBitacoraRecordModal';

interface BitacoraCardProps {
  projectId: string;
  events: readonly HourEntrySummary[];
  observations: readonly ProjectObservation[];
  modules: readonly ProjectModule[];
  canManage: boolean;
}

/** Bitácora unificada del proyecto: eventos (horas) + registros manuales, en una sola tabla filtrable con alta desde "Agregar registro". */
export function BitacoraCard({ projectId, events, observations, modules, canManage }: BitacoraCardProps) {
  const toast = useToast();

  const [filter, setFilter] = useState<'all' | 'incidents'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailRow, setDetailRow] = useState<BitacoraRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => toBitacoraRows(events, observations), [events, observations]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'incidents' && !rowIsIncident(row)) return false;
      const date = rowFilterDate(row);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      if (q) {
        const haystack = `${rowTitle(row)} ${rowResponsible(row)} ${rowPhase(row)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search, dateFrom, dateTo]);

  const columns: Column<BitacoraRow>[] = [
    { key: 'date', header: 'Fecha', render: rowDateDisplay },
    {
      key: 'type',
      header: 'Tipo',
      render: (row) => {
        const badge = rowTypeBadge(row);
        return <Badge tone={badge.tone}>{badge.label}</Badge>;
      },
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (row) => (
        <span className={styles.descCell} title={rowTooltip(row)}>
          {rowTitle(row)}
        </span>
      ),
    },
    { key: 'phase', header: 'Fase', render: rowPhase },
    { key: 'responsible', header: 'Responsable', render: rowResponsible },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => {
        const badge = rowStatusBadge(row);
        return badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <span className={styles.empty}>—</span>;
      },
    },
    {
      key: 'view',
      header: 'Ver',
      align: 'right',
      width: '56px',
      render: (row) => (
        <Button variant="ghost" size="icon" onClick={() => setDetailRow(row)} aria-label={`Ver detalle de ${rowTitle(row)}`}>
          <EyeIcon size={18} />
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <p className={styles.title}>Bitácora</p>

      <div className={styles.eventsPanel}>
        <div className={styles.eventsToolbar}>
          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>Tipo</span>
            <div className={styles.filterTabs} role="group" aria-label="Filtrar por tipo">
              <button
                type="button"
                aria-pressed={filter === 'all'}
                className={[styles.filterTab, filter === 'all' ? styles.filterTabActive : ''].join(' ')}
                onClick={() => setFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                aria-pressed={filter === 'incidents'}
                className={[styles.filterTab, filter === 'incidents' ? styles.filterTabActive : ''].join(' ')}
                onClick={() => setFilter('incidents')}
              >
                Incidentes
              </button>
            </div>
          </div>
          <TextField
            className={styles.eventsSearch}
            label="Buscar"
            type="search"
            placeholder="Buscar en la bitácora…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            iconLeft={<SearchIcon size={16} />}
          />
          <TextField className={styles.eventsDate} type="date" label="Desde" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <TextField className={styles.eventsDate} type="date" label="Hasta" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          {canManage && (
            <Button iconLeft={<PlusIcon size={16} />} onClick={() => setAddOpen(true)}>
              Agregar registro
            </Button>
          )}
        </div>

        <DataTable
          caption="Bitácora del proyecto"
          columns={columns}
          items={filteredRows}
          getRowKey={rowId}
          emptyMessage={
            rows.length === 0 ? 'Aún no hay actividad registrada para este proyecto.' : 'No hay registros que coincidan con el filtro.'
          }
        />
      </div>

      <Modal
        open={detailRow !== null}
        title={detailRow?.kind === 'evento' ? 'Detalle del evento' : 'Detalle del registro'}
        onClose={() => setDetailRow(null)}
        footer={<Button onClick={() => setDetailRow(null)}>Cerrar</Button>}
      >
        {detailRow?.kind === 'evento' && <EventDetail entry={detailRow.entry} />}
        {detailRow && detailRow.kind !== 'evento' && (
          <ObservationDetail projectId={projectId} observation={detailRow.observation} onClose={() => setDetailRow(null)} />
        )}
      </Modal>

      <AddBitacoraRecordModal
        open={addOpen}
        projectId={projectId}
        modules={modules}
        onClose={() => setAddOpen(false)}
        onSuccess={(message) => toast.success(message)}
      />
    </Card>
  );
}

function EventDetail({ entry }: { entry: HourEntrySummary }) {
  return (
    <div className={styles.detailGrid}>
      <DetailRow label="Responsable" value={entry.user.fullName} />
      <DetailRow label="Fecha del registro" value={new Date(entry.createdAt).toLocaleString('es-CL')} />
      <DetailRow label="Fecha imputada" value={entry.date} />
      <DetailRow label="Horas" value={`${formatEntryHours(entry.hours)} HH${entry.isOvertime ? ' (extra)' : ''}`} />
      <DetailRow label="Actividad" value={entry.category} />
      <DetailRow label="Fase" value={entry.module?.name ?? '—'} />
      <DetailRow label="Equipo" value={entry.team?.name ?? '—'} />
      <DetailRow label="Estado" value={EVENT_STATUS_LABEL[entry.status]} />
      <DetailRow label="Descripción" value={entry.description || 'Sin descripción'} />
      {entry.hasBlocker && <DetailRow label="Bloqueo reportado" value={entry.blockerDescription || 'Sin detalle'} />}
    </div>
  );
}

function ObservationDetail({
  projectId,
  observation,
  onClose,
}: {
  projectId: string;
  observation: ProjectObservation;
  onClose: () => void;
}) {
  const toast = useToast();
  const updateObservation = useUpdateProjectObservation();
  const deleteObservation = useDeleteProjectObservation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(observation.message);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const message = editValue.trim();
    if (!message) return;
    setError(null);
    try {
      await updateObservation.mutateAsync({ projectId, observationId: observation.id, input: { message } });
      toast.success('Se actualizó el registro.');
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo editar el registro.');
    }
  };

  const remove = async () => {
    try {
      await deleteObservation.mutateAsync({ projectId, observationId: observation.id });
      toast.success('Se eliminó el registro.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo eliminar el registro.');
    }
  };

  return (
    <div className={styles.detailGrid}>
      <DetailRow label="Tipo" value={PROJECT_OBSERVATION_TYPE_LABELS[observation.type]} />
      {observation.title && <DetailRow label="Título" value={observation.title} />}
      <DetailRow label="Fecha" value={observation.date} />
      <DetailRow label="Fase" value={observation.moduleName ?? '—'} />
      {observation.status && <DetailRow label="Estado" value={PROJECT_OBSERVATION_STATUS_LABELS[observation.status]} />}
      <DetailRow label="Autor" value={observation.authorName} />
      <DetailRow label="Registrado" value={new Date(observation.createdAt).toLocaleString('es-CL')} />

      {editing ? (
        <div className={styles.observationEdit}>
          <textarea className={styles.composerTextarea} value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus />
          {error && <span className={styles.composerError}>{error}</span>}
          <div className={styles.composerRow}>
            <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label="Cancelar edición">
              <CloseIcon size={14} />
            </Button>
            <Button
              type="button"
              size="sm"
              loading={updateObservation.isPending}
              loadingText="Guardando…"
              disabled={!editValue.trim()}
              onClick={() => void save()}
            >
              Guardar cambios
            </Button>
          </div>
        </div>
      ) : (
        <DetailRow label="Descripción" value={observation.message} />
      )}

      {(observation.canEdit || observation.canDelete) && !editing && (
        <div className={styles.composerRow}>
          {observation.canEdit && (
            <Button type="button" variant="outline" size="sm" iconLeft={<PencilIcon size={14} />} onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          {observation.canDelete && (
            <Button
              type="button"
              variant="dangerOutline"
              size="sm"
              iconLeft={<TrashIcon size={14} />}
              loading={deleteObservation.isPending}
              onClick={() => void remove()}
            >
              Eliminar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
