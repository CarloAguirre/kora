import type { BadgeTone } from '@/shared/components/ui/Badge';
import {
  PROJECT_OBSERVATION_STATUS_LABELS,
  PROJECT_OBSERVATION_TYPE_LABELS,
  type HourEntrySummary,
  type ProjectObservation,
  type ProjectObservationStatus,
  type ProjectObservationType,
} from '@kora/contracts';
import { entryTitle, EVENT_STATUS_LABEL, EVENT_STATUS_TONE } from './hour-entry-log';

/**
 * Una fila de la bitácora unificada: o bien un evento (hora registrada, de
 * solo lectura acá — se sigue creando desde el flujo normal de horas) o un
 * registro manual (hito/incidente/compromiso/atención/observación), creado
 * desde "Agregar registro". `kind` distingue ambos casos con el mismo valor
 * que ya trae `ProjectObservation.type` para los segundos. Compartido entre
 * `BitacoraCard` (tabla completa) y `BitacoraMiniCard` (resumen).
 */
export type BitacoraRow = { kind: 'evento'; entry: HourEntrySummary } | { kind: ProjectObservationType; observation: ProjectObservation };

export function toBitacoraRows(events: readonly HourEntrySummary[], observations: readonly ProjectObservation[]): BitacoraRow[] {
  const eventRows: BitacoraRow[] = events.map((entry) => ({ kind: 'evento', entry }));
  const obsRows: BitacoraRow[] = observations.map((observation) => ({ kind: observation.type, observation }));
  return [...eventRows, ...obsRows].sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)));
}

export function rowId(row: BitacoraRow): string {
  return row.kind === 'evento' ? row.entry.id : row.observation.id;
}
export function rowSortKey(row: BitacoraRow): string {
  return row.kind === 'evento' ? row.entry.createdAt : row.observation.createdAt;
}
export function rowFilterDate(row: BitacoraRow): string {
  return row.kind === 'evento' ? row.entry.date : row.observation.date;
}
export function rowDateDisplay(row: BitacoraRow): string {
  const iso = row.kind === 'evento' ? row.entry.createdAt : row.observation.createdAt;
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

const OBS_TYPE_TONE: Record<ProjectObservationType, BadgeTone> = {
  hito: 'info',
  incidente: 'danger',
  compromiso: 'warning',
  atencion: 'warning',
  observacion: 'neutral',
};

export function rowTypeBadge(row: BitacoraRow): { label: string; tone: BadgeTone } {
  if (row.kind === 'evento') {
    return row.entry.hasBlocker ? { label: 'Incidente', tone: 'danger' } : { label: 'Evento', tone: 'neutral' };
  }
  return { label: PROJECT_OBSERVATION_TYPE_LABELS[row.kind], tone: OBS_TYPE_TONE[row.kind] };
}

export function rowTitle(row: BitacoraRow): string {
  if (row.kind === 'evento') return entryTitle(row.entry);
  return row.observation.title || row.observation.message;
}

export function rowDescription(row: BitacoraRow): string {
  return row.kind === 'evento' ? row.entry.description : row.observation.message;
}

export function rowTooltip(row: BitacoraRow): string {
  if (row.kind === 'evento') {
    const parts = [row.entry.description || null, row.entry.hasBlocker ? `Bloqueo: ${row.entry.blockerDescription ?? 'sin detalle'}` : null];
    return parts.filter(Boolean).join(' — ');
  }
  return row.observation.title ? row.observation.message : '';
}

export function rowPhase(row: BitacoraRow): string {
  return (row.kind === 'evento' ? row.entry.module?.name : row.observation.moduleName) ?? '—';
}

export function rowResponsible(row: BitacoraRow): string {
  return row.kind === 'evento' ? row.entry.user.fullName : row.observation.authorName;
}

const OBS_STATUS_TONE: Record<ProjectObservationStatus, BadgeTone> = {
  abierto: 'danger',
  resuelto: 'success',
  pendiente: 'warning',
  cumplido: 'success',
  activo: 'warning',
};

export function rowStatusBadge(row: BitacoraRow): { label: string; tone: BadgeTone } | null {
  if (row.kind === 'evento') return { label: EVENT_STATUS_LABEL[row.entry.status], tone: EVENT_STATUS_TONE[row.entry.status] };
  if (!row.observation.status) return null;
  return { label: PROJECT_OBSERVATION_STATUS_LABELS[row.observation.status], tone: OBS_STATUS_TONE[row.observation.status] };
}

/** El filtro "Incidentes" junta los dos únicos indicios de "algo anda mal" que existen hoy: un registro tipo Incidente, y una hora con bloqueo reportado. */
export function rowIsIncident(row: BitacoraRow): boolean {
  return row.kind === 'incidente' || (row.kind === 'evento' && row.entry.hasBlocker);
}
