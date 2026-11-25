/**
 * Un registro de horas solo se edita o elimina dentro del mes en curso: los
 * meses cerrados ya se reportaron y facturaron. "Mes en curso" es el de Chile
 * (`America/Santiago`), no el de UTC — el 1 a las 21:00 de Santiago ya es el
 * día siguiente en UTC.
 */
const CHILE_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `entryDate` es una fecha calendario (medianoche UTC, como la guarda Drizzle con `mode: 'date'`). */
export function isInCurrentMonth(entryDate: Date, now: Date): boolean {
  return entryDate.toISOString().slice(0, 7) === CHILE_DATE.format(now).slice(0, 7);
}
