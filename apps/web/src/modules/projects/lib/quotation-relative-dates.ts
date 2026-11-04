/** Calendario referencial de una cotización transferida.
 * La semana 1 empieza en project.startDate; cada semana comercial ocupa
 * siete días calendario. NO genera ni persiste bloques, entregas o Forecast.
 * Si se cambia el inicio, las propuestas se vuelven a calcular desde la fuente.
 */
export interface ProposedBlockPeriod {
  startDate: string;
  endDate: string;
}

export function shiftIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function proposedBlockPeriod(
  projectStartDate: string | null | undefined,
  startWeek: number,
  durationWeeks: number,
): ProposedBlockPeriod | null {
  if (!projectStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(projectStartDate) ||
      !Number.isInteger(startWeek) || !Number.isInteger(durationWeeks) ||
      startWeek < 1 || durationWeeks < 1 || startWeek + durationWeeks - 1 > 520) return null;
  const startDate = shiftIsoDays(projectStartDate, (startWeek - 1) * 7);
  const endDate = shiftIsoDays(projectStartDate, (startWeek + durationWeeks - 1) * 7 - 1);
  return { startDate, endDate };
}

/** Ej. "05-11-2026", sin conversión horaria del navegador. */
export const displayProposedDate = (iso: string) =>
  iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4);
