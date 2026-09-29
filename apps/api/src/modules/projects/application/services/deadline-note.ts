/**
 * Cumplimiento de plazo para los registros automáticos de la bitácora (entregas y tareas): permite
 * reconstruir después qué se terminó/aprobó a tiempo y qué fuera de plazo, y por cuánto.
 *
 * Las fechas comprometidas se guardan como día calendario (medianoche UTC); "hoy" se toma en hora
 * de Chile — terminar algo el mismo día de su fecha comprometida cuenta como a tiempo.
 */
const CHILE_TIME_ZONE = 'America/Santiago';

export const formatCommittedDate = (value: Date): string => value.toLocaleDateString('es-CL', { timeZone: 'UTC' });

function calendarDayInChile(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHILE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Días de atraso respecto de `committedDate` (0 si fue a tiempo). */
export function daysLate(committedDate: Date, now: Date): number {
  const committed = committedDate.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(calendarDayInChile(now)) - Date.parse(committed)) / 86_400_000);
  return Math.max(days, 0);
}

/** "a tiempo (fecha comprometida 24-09-2026)" / "con 3 días de atraso (fecha comprometida 24-09-2026)". */
export function deadlineNote(committedDate: Date, now: Date): string {
  const late = daysLate(committedDate, now);
  const committed = `fecha comprometida ${formatCommittedDate(committedDate)}`;
  return late === 0 ? `a tiempo (${committed})` : `con ${late} ${late === 1 ? 'día' : 'días'} de atraso (${committed})`;
}
