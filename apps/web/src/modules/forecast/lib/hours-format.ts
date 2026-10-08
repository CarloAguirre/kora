const HOURS_FORMAT = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

/** HH con formato chileno y a lo más un decimal, p. ej. "667,4". */
export function formatHours(hours: number): string {
  return HOURS_FORMAT.format(hours);
}
