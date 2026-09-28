import type { BadgeTone } from '@/shared/components/ui/Badge';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_OBSERVATION_ALLOWED_TRANSITIONS,
  PROJECT_OBSERVATION_STATUS_LABELS,
  PROJECT_OBSERVATION_TYPE_LABELS,
  type HourEntrySummary,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleDeliveryStatus,
  type ProjectObservation,
  type ProjectObservationStatus,
  type ProjectObservationType,
} from '@kora/contracts';
import { entryTitle, EVENT_STATUS_LABEL, EVENT_STATUS_TONE } from './hour-entry-log';

/**
 * Una fila de la bitácora unificada: un evento (hora registrada, de solo
 * lectura acá), un registro manual (hito/incidente/compromiso/atención/
 * observación, creado desde "Agregar registro"), o una entrega de fase — de
 * solo lectura acá también: su ciclo de vida (asignar, marcar entregada,
 * aprobar/rechazar) se gestiona desde la vista de líder de equipo
 * (`TeamDeliveriesCard`), no desde la bitácora. `kind` distingue los tres
 * casos, con el mismo valor que ya trae `ProjectObservation.type` para el
 * segundo. Compartido entre `BitacoraCard` (tabla completa) y
 * `BitacoraMiniCard` (resumen).
 */
export type BitacoraRow =
  | { kind: 'evento'; entry: HourEntrySummary }
  | { kind: ProjectObservationType; observation: ProjectObservation }
  | { kind: 'entrega'; delivery: ProjectModuleDelivery; moduleId: string; moduleName: string };

export function toBitacoraRows(
  events: readonly HourEntrySummary[],
  observations: readonly ProjectObservation[],
  modules: readonly ProjectModule[] = [],
): BitacoraRow[] {
  const eventRows: BitacoraRow[] = events.map((entry) => ({ kind: 'evento', entry }));
  const obsRows: BitacoraRow[] = observations.map((observation) => ({ kind: observation.type, observation }));
  const deliveryRows: BitacoraRow[] = modules.flatMap((module) =>
    module.deliveries.map((delivery) => ({ kind: 'entrega' as const, delivery, moduleId: module.id, moduleName: module.name })),
  );
  return [...eventRows, ...obsRows, ...deliveryRows].sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)));
}

export function rowId(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.id;
  if (row.kind === 'entrega') return row.delivery.id;
  return row.observation.id;
}
/** Una entrega no trae fecha de creación — se ordena por su fecha estimada, a medianoche, para intercalarse razonablemente con las demás filas (que sí traen hora). */
export function rowSortKey(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.createdAt;
  if (row.kind === 'entrega') return `${row.delivery.estimatedDate}T00:00:00.000Z`;
  return row.observation.createdAt;
}
export function rowFilterDate(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.date;
  if (row.kind === 'entrega') return row.delivery.estimatedDate;
  return row.observation.date;
}
export function rowDateDisplay(row: BitacoraRow): string {
  if (row.kind === 'entrega') {
    return new Date(`${row.delivery.estimatedDate}T00:00:00`).toLocaleDateString('es-CL', { dateStyle: 'short' });
  }
  // El registro de activación muestra la fecha del Hito 0 (corregible), no cuándo se registró.
  if (row.kind !== 'evento' && row.observation.isHito0) {
    return new Date(`${row.observation.date}T00:00:00`).toLocaleDateString('es-CL', { dateStyle: 'short' });
  }
  const iso = row.kind === 'evento' ? row.entry.createdAt : row.observation.createdAt;
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

const OBS_TYPE_TONE: Record<ProjectObservationType, BadgeTone> = {
  hito: 'info',
  incidente: 'danger',
  compromiso: 'warning',
  atencion: 'warning',
  observacion: 'neutral',
  cambio_proyecto: 'neutral',
};

export function rowTypeBadge(row: BitacoraRow): { label: string; tone: BadgeTone } {
  if (row.kind === 'evento') {
    return row.entry.hasBlocker ? { label: 'Incidente', tone: 'danger' } : { label: 'Evento', tone: 'neutral' };
  }
  if (row.kind === 'entrega') return { label: 'Entrega', tone: 'info' };
  return { label: PROJECT_OBSERVATION_TYPE_LABELS[row.kind], tone: OBS_TYPE_TONE[row.kind] };
}

export function rowTitle(row: BitacoraRow): string {
  if (row.kind === 'evento') return entryTitle(row.entry);
  if (row.kind === 'entrega') return `Entrega de fase: ${row.moduleName}`;
  return row.observation.title || row.observation.message;
}

export function rowDescription(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.description;
  if (row.kind === 'entrega') return deliveryTooltip(row);
  return row.observation.message;
}

export function rowTooltip(row: BitacoraRow): string {
  if (row.kind === 'evento') {
    const parts = [row.entry.description || null, row.entry.hasBlocker ? `Bloqueo: ${row.entry.blockerDescription ?? 'sin detalle'}` : null];
    return parts.filter(Boolean).join(' — ');
  }
  if (row.kind === 'entrega') return deliveryTooltip(row);
  return row.observation.title ? row.observation.message : '';
}

function deliveryTooltip(row: { moduleName: string; delivery: ProjectModuleDelivery }): string {
  return row.delivery.teamName ? `${row.moduleName} — equipo ${row.delivery.teamName}` : row.moduleName;
}

export function rowPhase(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.module?.name ?? '—';
  if (row.kind === 'entrega') return row.moduleName;
  return row.observation.moduleName ?? '—';
}

export function rowResponsible(row: BitacoraRow): string {
  if (row.kind === 'evento') return row.entry.user.fullName;
  if (row.kind === 'entrega') return row.delivery.teamName ?? '—';
  return row.observation.authorName;
}

const OBS_STATUS_TONE: Record<ProjectObservationStatus, BadgeTone> = {
  abierto: 'danger',
  resuelto: 'success',
  pendiente: 'warning',
  cumplido: 'success',
  activo: 'warning',
  rechazado: 'danger',
};

const DELIVERY_STATUS_TONE: Record<ProjectModuleDeliveryStatus, BadgeTone> = {
  planned: 'warning',
  delivered: 'info',
  approved: 'success',
};

export function rowStatusBadge(row: BitacoraRow): { label: string; tone: BadgeTone } | null {
  if (row.kind === 'evento') return { label: EVENT_STATUS_LABEL[row.entry.status], tone: EVENT_STATUS_TONE[row.entry.status] };
  if (row.kind === 'entrega') {
    return { label: PROJECT_MODULE_DELIVERY_STATUS_LABELS[row.delivery.status], tone: DELIVERY_STATUS_TONE[row.delivery.status] };
  }
  if (!row.observation.status) return null;
  return { label: PROJECT_OBSERVATION_STATUS_LABELS[row.observation.status], tone: OBS_STATUS_TONE[row.observation.status] };
}

/** El filtro "Incidentes" junta los dos únicos indicios de "algo anda mal" que existen hoy: un registro tipo Incidente, y una hora con bloqueo reportado. */
export function rowIsIncident(row: BitacoraRow): boolean {
  return row.kind === 'incidente' || (row.kind === 'evento' && row.entry.hasBlocker);
}

export type BitacoraRowAction = 'aprobar' | 'rechazar' | 'cerrar' | 'reabrir';

const ACTION_BY_STATUS: Readonly<Partial<Record<ProjectObservationStatus, BitacoraRowAction>>> = {
  cumplido: 'aprobar',
  rechazado: 'rechazar',
  resuelto: 'cerrar',
  abierto: 'reabrir',
};

/**
 * Qué botones de resolución mostrar en la fila (aprobar/rechazar un compromiso, cerrar/reabrir
 * un incidente) — vacío si el actor no puede resolver pendientes (`canResolve`) o si este tipo/estado
 * no tiene una transición definida (ver `PROJECT_OBSERVATION_ALLOWED_TRANSITIONS`).
 */
export function rowResolveActions(row: BitacoraRow): readonly { action: BitacoraRowAction; nextStatus: ProjectObservationStatus }[] {
  if (row.kind !== 'evento' && row.kind !== 'entrega') {
    const { observation } = row;
    if (observation.canResolve && observation.status) {
      const nextStatuses = PROJECT_OBSERVATION_ALLOWED_TRANSITIONS[observation.type]?.[observation.status];
      if (nextStatuses) return nextStatuses.map((nextStatus) => ({ action: ACTION_BY_STATUS[nextStatus] ?? 'aprobar', nextStatus }));
    }
  }
  return [];
}

