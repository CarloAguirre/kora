/**
 * Fechas de calendario (`YYYY-MM-DD`) en hora de Chile continental.
 *
 * Los recordatorios razonan en días locales, no en instantes: "hoy" a las
 * 18:00 de Santiago sigue siendo hoy aunque en UTC ya sea mañana. Se resuelve
 * con la zona `America/Santiago` (y no con un desfase fijo como hacían los
 * scripts de la v1), así que el cambio de horario de verano no corre nada.
 */

const CHILE_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Día calendario de Chile en que cae `instant`. `en-CA` formatea como `YYYY-MM-DD`. */
export function chileDate(instant: Date): string {
  return CHILE_DATE.format(instant);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Días entre dos fechas calendario (`to - from`); negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Lunes a viernes de `from` a `to`, ambos incluidos. */
export function weekdaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) days.push(day);
  }
  return days;
}
