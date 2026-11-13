/** Fechas reales de un tramo según la semana relativa de la cotización aprobada.
 * Semana 1 comienza en la fecha de inicio del proyecto. Semanas de 7 días
 * calendario, fecha final inclusiva. No depende de huso horario del navegador.
 */
export function approvedCalendarPeriod(
  startDate: string,
  startWeek: number,
  durationWeeks: number,
): { startDate: string; endDate: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !Number.isInteger(startWeek) || !Number.isInteger(durationWeeks) ||
      startWeek < 1 || durationWeeks < 1 ||
      startWeek + durationWeeks - 1 > 520) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  const initial = new Date(Date.UTC(y!, m! - 1, d!));
  if (Number.isNaN(initial.getTime()) || initial.toISOString().slice(0, 10) !== startDate) return null;
  const addDays = (days: number) => {
    const date = new Date(initial.getTime());
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return {
    startDate: addDays((startWeek - 1) * 7),
    endDate: addDays((startWeek + durationWeeks - 1) * 7 - 1),
  };
}
