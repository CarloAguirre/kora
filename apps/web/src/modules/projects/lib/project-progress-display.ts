import type { ProjectProgress } from '@kora/contracts';
import { currentChileDate } from './team-progress';

/** "42%" o "Sin plan" cuando el proyecto/fase todavía no tiene tareas cargadas — nunca "0%". */
export function formatProgressPercent(value: number | null): string {
  return value != null ? `${value}%` : 'Sin plan';
}

/** Retraso en puntos de avance: "+12 pts" (atrasado), "-3 pts" (adelantado), "—" sin evaluar. */
export function formatProgressDelay(progress: ProjectProgress): string {
  if (progress.delay == null) return '—';
  return `${progress.delay > 0 ? '+' : ''}${progress.delay} ${Math.abs(progress.delay) === 1 ? 'pt' : 'pts'}`;
}

/**
 * Porcentaje de PLAZO CALENDARIO transcurrido (NO avance real):
 * fallback visual exclusivo para proyectos sin bloques con HH planificadas.
 * Días inclusivos, fechas ISO sin TZ y "hoy" en hora de Chile. No usa Hito 0
 * ni horas consumidas; no altera el progreso operacional de la API.
 */
function calendarDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp / 86_400_000;
}

export function calculateScheduleElapsedPercent(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today = currentChileDate(),
): number | null {
  const start = calendarDay(startDate);
  const end = calendarDay(endDate);
  const current = calendarDay(today);
  if (start == null || end == null || current == null || end < start) return null;
  const duration = end - start + 1;
  const elapsed = Math.max(0, Math.min(duration, current - start + 1));
  return Math.round(100 * elapsed / duration);
}
