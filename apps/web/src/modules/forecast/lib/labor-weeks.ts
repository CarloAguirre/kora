/** Semanas laborales (lunes a viernes) seleccionables — réplica de `buildLaborWeekRanges` en la v1. */

export interface LaborWeek {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly label: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function mondayOf(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta corta para un rango semanal, p. ej. "7 – 11 sep 2026" o "28 sep – 2 oct 2026". */
export function formatShortRange(periodStart: string, periodEnd: string): string {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const year = end.getUTCFullYear();
  const startMonth = MONTHS_SHORT[start.getUTCMonth()];
  const endMonth = MONTHS_SHORT[end.getUTCMonth()];

  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${endMonth} ${year}`;
  }
  return `${start.getUTCDate()} ${startMonth} – ${end.getUTCDate()} ${endMonth} ${year}`;
}

function formatRange(start: Date, end: Date): string {
  const fmt = (date: Date) =>
    `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  return `${fmt(start)} al ${fmt(end)}`;
}

export function buildLaborWeeks(baseDate = new Date(), pastWeeks = 6, futureWeeks = 8): LaborWeek[] {
  const currentMonday = mondayOf(baseDate);
  const weeks: LaborWeek[] = [];

  for (let offset = -pastWeeks; offset <= futureWeeks; offset++) {
    const start = new Date(currentMonday);
    start.setUTCDate(start.getUTCDate() + offset * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);

    weeks.push({ periodStart: toIsoDate(start), periodEnd: toIsoDate(end), label: formatRange(start, end) });
  }

  return weeks;
}

export function currentLaborWeek(baseDate = new Date()): LaborWeek {
  const monday = mondayOf(baseDate);
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);
  return { periodStart: toIsoDate(monday), periodEnd: toIsoDate(friday), label: formatRange(monday, friday) };
}
