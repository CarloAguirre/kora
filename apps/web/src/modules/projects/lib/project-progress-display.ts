import type { ProjectProgress } from '@kora/contracts';

/** "42%" o "Sin plan" cuando el proyecto/fase todavía no tiene tareas cargadas — nunca "0%". */
export function formatProgressPercent(value: number | null): string {
  return value != null ? `${value}%` : 'Sin plan';
}

/** Retraso en puntos de avance: "+12 pts" (atrasado), "-3 pts" (adelantado), "—" sin evaluar. */
export function formatProgressDelay(progress: ProjectProgress): string {
  if (progress.delay == null) return '—';
  return `${progress.delay > 0 ? '+' : ''}${progress.delay} ${Math.abs(progress.delay) === 1 ? 'pt' : 'pts'}`;
}
