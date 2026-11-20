/**
 * Días hábiles (lunes-viernes, sin feriados) sobre fechas ISO `YYYY-MM-DD`.
 * `holidays` trae las fechas ISO de los feriados no laborables (`GET /holidays`
 * ya excluye los `isWorkingDay`). Compartido entre la duración del tramo en
 * `ProjectModulesCard` y el cálculo de "Fecha fin" en `ExecutionSegmentModal`.
 */

const parseUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(toIso(date));
}

/** Días hábiles entre dos fechas ISO, inclusive. */
export function countBusinessDays(startDate: string, endDate: string, holidays: ReadonlySet<string>): number {
  if (!startDate || !endDate || startDate > endDate) return 0;
  let count = 0;
  const end = parseUtc(endDate);
  for (const day = parseUtc(startDate); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (isBusinessDay(day, holidays)) count += 1;
  }
  return count;
}

/**
 * Fecha del `days`-ésimo día hábil contando desde `startDate` (inclusive) — la
 * "Fecha fin" de un tramo que dura `days` días hábiles. Si `startDate` cae en
 * fin de semana o feriado, se cuenta desde el siguiente día hábil.
 */
export function addBusinessDays(startDate: string, days: number, holidays: ReadonlySet<string>): string {
  const day = parseUtc(startDate);
  let count = 0;
  for (;;) {
    if (isBusinessDay(day, holidays)) count += 1;
    if (count >= days) return toIso(day);
    day.setUTCDate(day.getUTCDate() + 1);
  }
}
