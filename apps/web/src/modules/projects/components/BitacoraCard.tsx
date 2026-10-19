import { useMemo, useState } from 'react';
import {
  PROJECT_OBSERVATION_STATUS_LABELS,
  PROJECT_OBSERVATION_TYPE_LABELS,
  type HourEntrySummary,
  type ProjectModule,
  type ProjectObservation,
  type ProjectObservationStatus,
  type ProjectTeam,
  type ProjectTeamMember,
} from '@kora/contracts';
import styles from './BitacoraCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { TextField } from '@/shared/components/ui/TextField';
import { Combobox } from '@/shared/components/ui/Combobox';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { DropdownMenu, type DropdownMenuItem } from '@/shared/components/ui/DropdownMenu';
import { useToast } from '@/shared/components/ui/Toast';
import { EyeIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '@/shared/components/icons/Icons';
import {
  useCorrectProjectHito0Date,
  useDeleteProjectObservation,
  useResolveProjectObservation,
  useUpdateProjectModuleDelivery,
  useUpdateProjectObservation,
} from '../api/projects.queries';
import { ApiRequestError } from '@/shared/lib/api-client';
import { EVENT_STATUS_LABEL, formatEntryHours } from '../lib/hour-entry-log';
import {
  rowDateDisplay,
  rowFilterDate,
  rowId,
  rowIsDeliveryOrTask,
  rowIsIncident,
  rowPhase,
  rowResolveActions,
  rowResponsible,
  rowStatusBadge,
  rowTitle,
  rowTooltip,
  rowTypeBadge,
  toBitacoraRows,
  type BitacoraRow,
  type BitacoraRowAction,
} from '../lib/bitacora-row';
import { deliveryActionLabel, deliveryActions, deliveryStatusLabel, type DeliveryAction } from '../lib/delivery-status';
import { AddBitacoraRecordModal } from './AddBitacoraRecordModal';
import { DeliveryActionDialogs, type DeliveryActionTarget } from './DeliveryActionDialogs';

interface BitacoraCardProps {
  projectId: string;
  events: readonly HourEntrySummary[];
  observations: readonly ProjectObservation[];
  modules: readonly ProjectModule[];
  teams: readonly ProjectTeam[];
  /** Colaboradores del proyecto — para asignar/reasignar una entrega desde su menú de acciones. */
  members: readonly ProjectTeamMember[];
  canManage: boolean;
  /** Gerencia/PMO (`projects:manage`): puede corregir la fecha del Hito 0 desde su registro de activación. */
  canCorrectHito0?: boolean;
}

const RESOLVE_ACTION_LABEL: Record<BitacoraRowAction, string> = {
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  cerrar: 'Cerrar incidente',
  reabrir: 'Reabrir incidente',
};

const RESOLVE_ACTION_TONE: Record<BitacoraRowAction, DropdownMenuItem['tone']> = {
  aprobar: 'success',
  rechazar: 'danger',
  cerrar: 'default',
  reabrir: 'default',
};

const DELIVERY_ACTION_TONE: Record<DeliveryAction, DropdownMenuItem['tone']> = {
  complete: 'default',
  assign: 'default',
  approve: 'success',
  reject: 'danger',
  revert: 'default',
};

/** Bitácora unificada del proyecto: eventos (horas) + registros manuales, en una sola tabla filtrable con alta desde "Agregar registro". */
export function BitacoraCard({
  projectId,
  events,
  observations,
  modules,
  teams,
  members,
  canManage,
  canCorrectHito0 = false,
}: BitacoraCardProps) {
  const toast = useToast();
  const resolveObservation = useResolveProjectObservation();

  const [filter, setFilter] = useState<'all' | 'incidents' | 'work'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailRow, setDetailRow] = useState<BitacoraRow | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [addOpen, setAddOpen] = useState(false);
  const [deliveryAction, setDeliveryAction] = useState<DeliveryActionTarget | null>(null);

  const openDetail = (row: BitacoraRow, mode: 'view' | 'edit' = 'view') => {
    setDetailRow(row);
    setDetailMode(mode);
  };

  const rows = useMemo(() => toBitacoraRows(events, observations, modules), [events, observations, modules]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'incidents' && !rowIsIncident(row)) return false;
      if (filter === 'work' && !rowIsDeliveryOrTask(row)) return false;
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
  const { pageItems, pagination } = usePaginatedItems(filteredRows);

  const resolveRow = async (row: BitacoraRow, nextStatus: ProjectObservationStatus, actionLabel: string) => {
    if (row.kind === 'evento' || row.kind === 'entrega') return;
    try {
      await resolveObservation.mutateAsync({ projectId, observationId: row.observation.id, input: { status: nextStatus } });
      toast.success(`${actionLabel}: listo.`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar el registro.');
    }
  };

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
      align: 'center',
      width: '56px',
      render: (row) => (
        <Button variant="ghost" size="icon" onClick={() => openDetail(row, 'view')} aria-label={`Ver detalle de ${rowTitle(row)}`}>
          <EyeIcon size={18} />
        </Button>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'center',
      width: '56px',
      render: (row) => {
        const canEdit = row.kind !== 'evento' && row.kind !== 'entrega' && row.observation.canEdit;
        // Solo quien puede gestionar ESA entrega (líder del proyecto, PMO/admin o líder de su equipo) — lo decide el backend.
        const canEditDelivery = row.kind === 'entrega' && row.delivery.canManage;
        const deliveryItems: DropdownMenuItem[] =
          row.kind === 'entrega'
            ? deliveryActions(row.delivery).map((action) => ({
                key: `entrega-${action}`,
                label: deliveryActionLabel(action, row.delivery),
                tone: DELIVERY_ACTION_TONE[action],
                onSelect: () => setDeliveryAction({ action, moduleId: row.moduleId, moduleName: row.moduleName, delivery: row.delivery }),
              }))
            : [];
        const canEditHito0 = row.kind !== 'evento' && row.kind !== 'entrega' && row.observation.isHito0 && canCorrectHito0;
        const resolveActions = rowResolveActions(row);
        if (!canEdit && !canEditDelivery && !canEditHito0 && resolveActions.length === 0) return null;

        const items: DropdownMenuItem[] = [
          ...deliveryItems,
          ...resolveActions.map(({ action, nextStatus }) => ({
            key: action,
            label: RESOLVE_ACTION_LABEL[action],
            tone: RESOLVE_ACTION_TONE[action],
            onSelect: () => void resolveRow(row, nextStatus, RESOLVE_ACTION_LABEL[action]),
          })),
          ...(canEdit || canEditDelivery
            ? [{ key: 'editar', label: 'Editar detalle', onSelect: () => openDetail(row, 'edit') }]
            : []),
          ...(canEditHito0
            ? [{ key: 'corregir-hito0', label: 'Corregir fecha Hito 0', onSelect: () => openDetail(row, 'edit') }]
            : []),
        ];

        return (
          <DropdownMenu
            items={items}
            trigger={({ onClick, open }) => (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={open ? styles.actionsTriggerActive : undefined}
                onClick={onClick}
                aria-label={`Acciones — ${rowTitle(row)}`}
                title="Acciones"
              >
                <PencilIcon size={16} />
              </Button>
            )}
          />
        );
      },
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
              <button
                type="button"
                aria-pressed={filter === 'work'}
                className={[styles.filterTab, filter === 'work' ? styles.filterTabActive : ''].join(' ')}
                onClick={() => setFilter('work')}
              >
                Entregas y tareas
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
          items={pageItems}
          getRowKey={rowId}
          emptyMessage={
            rows.length === 0 ? 'Aún no hay actividad registrada para este proyecto.' : 'No hay registros que coincidan con el filtro.'
          }
        />

        <Pagination {...pagination} />
      </div>

      <Modal
        open={detailRow !== null}
        title={
          detailRow?.kind === 'evento'
            ? 'Detalle del evento'
            : detailRow?.kind === 'entrega'
              ? 'Detalle de la entrega'
              : detailRow?.observation.isHito0
                ? 'Activación del proyecto (Hito 0)'
                : 'Detalle del registro'
        }
        onClose={() => setDetailRow(null)}
        footer={
          <Button variant="outline" onClick={() => setDetailRow(null)}>
            Cerrar
          </Button>
        }
      >
        {detailRow?.kind === 'evento' && <EventDetail entry={detailRow.entry} />}
        {detailRow?.kind === 'entrega' && (
          <DeliveryDetail
            projectId={projectId}
            row={detailRow}
            teams={teams}
            history={observations.filter((observation) => observation.deliveryId === detailRow.delivery.id)}
            canEdit={detailRow.delivery.canManage}
            initialEditing={detailMode === 'edit'}
          />
        )}
        {detailRow && detailRow.kind !== 'evento' && detailRow.kind !== 'entrega' && (
          <ObservationDetail
            projectId={projectId}
            observation={detailRow.observation}
            initialEditing={detailMode === 'edit'}
            canCorrectHito0={canCorrectHito0}
            onClose={() => setDetailRow(null)}
          />
        )}
      </Modal>

      <AddBitacoraRecordModal
        open={addOpen}
        projectId={projectId}
        modules={modules}
        onClose={() => setAddOpen(false)}
        onSuccess={(message) => toast.success(message)}
      />

      <DeliveryActionDialogs projectId={projectId} members={members} target={deliveryAction} onClose={() => setDeliveryAction(null)} />
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

const TEAM_OPTION_UNASSIGNED = '';

function DeliveryDetail({
  projectId,
  row,
  teams,
  history,
  canEdit,
  initialEditing = false,
}: {
  projectId: string;
  row: Extract<BitacoraRow, { kind: 'entrega' }>;
  teams: readonly ProjectTeam[];
  /** Registros automáticos de esta entrega (`observation.deliveryId`) — quién la asignó, terminó, aprobó o rechazó, y cuándo. */
  history: readonly ProjectObservation[];
  canEdit: boolean;
  initialEditing?: boolean;
}) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const [editing, setEditing] = useState(initialEditing && canEdit);
  const [teamId, setTeamId] = useState(row.delivery.teamId ?? TEAM_OPTION_UNASSIGNED);
  const [estimatedDate, setEstimatedDate] = useState(row.delivery.estimatedDate);
  const [error, setError] = useState<string | null>(null);

  const teamOptions = [
    { value: TEAM_OPTION_UNASSIGNED, label: 'Sin asignar' },
    ...teams.map((team) => ({ value: team.teamId, label: team.teamName })),
  ];

  const save = async () => {
    if (!estimatedDate) return;
    setError(null);
    try {
      await updateDelivery.mutateAsync({
        projectId,
        moduleId: row.moduleId,
        deliveryId: row.delivery.id,
        input: { teamId: teamId || null, estimatedDate },
      });
      toast.success('Se actualizó la entrega.');
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo editar la entrega.');
    }
  };

  if (editing) {
    const teamChanged = (teamId || null) !== row.delivery.teamId;
    return (
      <div className={styles.detailGrid}>
        <DetailRow label="Entrega" value={rowTitle(row)} />
        <DetailRow label="Fase" value={row.moduleName} />
        <DetailRow label="Estado" value={deliveryStatusLabel(row.delivery)} />
        <Combobox label="Equipo" options={teamOptions} value={teamId} onChange={setTeamId} />
        {teamChanged && row.delivery.assigneeUserId && (
          <span className={styles.detailLabel}>
            Si {row.delivery.assigneeName ?? 'el colaborador asignado'} no pertenece al nuevo equipo, la entrega quedará sin asignar.
          </span>
        )}
        <TextField label="Fecha estimada" type="date" value={estimatedDate} onChange={(event) => setEstimatedDate(event.target.value)} />
        {error && <span className={styles.composerError}>{error}</span>}
        <div className={styles.composerRow}>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            loading={updateDelivery.isPending}
            loadingText="Guardando…"
            disabled={!estimatedDate}
            onClick={() => void save()}
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailGrid}>
      <DetailRow label="Entrega" value={rowTitle(row)} />
      {row.delivery.description && <DetailRow label="Descripción" value={row.delivery.description} />}
      <DetailRow label="Fase" value={row.moduleName} />
      <DetailRow label="Equipo" value={row.delivery.teamName ?? 'Sin asignar'} />
      <DetailRow label="Colaborador" value={row.delivery.assigneeName ?? 'Sin asignar'} />
      <DetailRow label="Fecha estimada" value={new Date(`${row.delivery.estimatedDate}T00:00:00`).toLocaleDateString('es-CL')} />
      <DetailRow
        label="Agregada"
        value={new Date(row.delivery.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
      />
      <DetailRow label="Estado" value={deliveryStatusLabel(row.delivery)} />
      {row.delivery.rejectionReason && <DetailRow label="Motivo del rechazo" value={row.delivery.rejectionReason} />}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Historial</span>
        {history.length === 0 ? (
          <span className={styles.detailValue}>Sin movimientos registrados todavía.</span>
        ) : (
          <ul className={styles.historyList}>
            {[...history]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((entry) => (
                <li key={entry.id} className={styles.historyItem}>
                  <span className={styles.historyMeta}>
                    {new Date(entry.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · {entry.authorName}
                  </span>
                  <span className={styles.detailValue}>{entry.message}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      {canEdit && (
        <div className={styles.composerRow}>
          <Button type="button" variant="outline" size="sm" iconLeft={<PencilIcon size={14} />} onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}

function ObservationDetail({
  projectId,
  observation,
  initialEditing = false,
  canCorrectHito0,
  onClose,
}: {
  projectId: string;
  observation: ProjectObservation;
  initialEditing?: boolean;
  canCorrectHito0: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const updateObservation = useUpdateProjectObservation();
  const deleteObservation = useDeleteProjectObservation();
  const [editing, setEditing] = useState(initialEditing && observation.canEdit);
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
      {observation.isHito0 ? (
        <Hito0DateField
          projectId={projectId}
          date={observation.date}
          canEdit={canCorrectHito0}
          initialEditing={initialEditing && canCorrectHito0}
        />
      ) : (
        <DetailRow label="Fecha" value={observation.date} />
      )}
      <DetailRow label="Fase" value={observation.moduleName ?? '—'} />
      {observation.status && <DetailRow label="Estado" value={PROJECT_OBSERVATION_STATUS_LABELS[observation.status]} />}
      <DetailRow label="Autor" value={observation.authorName} />
      <DetailRow label="Registrado" value={new Date(observation.createdAt).toLocaleString('es-CL')} />

      {editing ? (
        <div className={styles.observationEdit}>
          <textarea className={styles.composerTextarea} value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus />
          {error && <span className={styles.composerError}>{error}</span>}
          <div className={styles.composerRow}>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancelar
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

/**
 * Fecha del Hito 0 en su registro de activación — corregirla actualiza `project.hito0At` (y con ello el
 * corte de horas pre-activación), sin cambiar el estado del proyecto. Reemplaza la antigua franja
 * "Hito 0: … / Corregir fecha" de la ficha.
 */
function Hito0DateField({
  projectId,
  date,
  canEdit,
  initialEditing,
}: {
  projectId: string;
  date: string;
  canEdit: boolean;
  initialEditing: boolean;
}) {
  const toast = useToast();
  const correctHito0Date = useCorrectProjectHito0Date();
  const [editing, setEditing] = useState(initialEditing);
  // La fila del modal es una foto tomada al abrirlo — se guarda acá la fecha ya corregida para no mostrar la anterior.
  const [currentDate, setCurrentDate] = useState(date);
  const [draft, setDraft] = useState(date);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft) return;
    setError(null);
    try {
      await correctHito0Date.mutateAsync({ projectId, input: { date: draft } });
      toast.success('Se corrigió la fecha del Hito 0.');
      setCurrentDate(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo corregir la fecha del Hito 0.');
    }
  };

  if (editing) {
    return (
      <div className={styles.observationEdit}>
        <TextField label="Fecha del Hito 0" type="date" value={draft} onChange={(event) => setDraft(event.target.value)} />
        {error && <span className={styles.composerError}>{error}</span>}
        <div className={styles.composerRow}>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            loading={correctHito0Date.isPending}
            loadingText="Guardando…"
            disabled={!draft || draft === currentDate}
            onClick={() => void save()}
          >
            Guardar fecha
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <DetailRow label="Fecha del Hito 0" value={new Date(`${currentDate}T00:00:00`).toLocaleDateString('es-CL')} />
      {canEdit && (
        <div className={styles.composerRow}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            iconLeft={<PencilIcon size={14} />}
            onClick={() => {
              setDraft(currentDate);
              setEditing(true);
            }}
          >
            Corregir fecha
          </Button>
        </div>
      )}
    </>
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
