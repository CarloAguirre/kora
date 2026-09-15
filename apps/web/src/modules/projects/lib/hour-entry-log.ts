import type { BadgeTone } from '@/shared/components/ui/Badge';
import type { HourEntryStatus, HourEntrySummary } from '@kora/contracts';

/** Compartido entre `BitacoraCard` (tabla completa) y `BitacoraMiniCard` (resumen en la pestaña Resumen). */

export const EVENT_STATUS_LABEL: Record<HourEntryStatus, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  pending: 'Pendiente',
};

export const EVENT_STATUS_TONE: Record<HourEntryStatus, BadgeTone> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
};

export function formatEntryHours(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

export function entryTitle(entry: HourEntrySummary): string {
  return `${entry.user.fullName} registró ${formatEntryHours(entry.hours)} HH${entry.category ? ` · ${entry.category}` : ''}`;
}
