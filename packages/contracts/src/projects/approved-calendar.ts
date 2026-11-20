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
      !Number.isInteger(startWeek * 2) || !Number.isInteger(durationWeeks * 2) ||
      startWeek < 1 || durationWeeks < 0.5 ||
      startWeek + durationWeeks > 521) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  const initial = new Date(Date.UTC(y!, m! - 1, d!));
  if (Number.isNaN(initial.getTime()) || initial.toISOString().slice(0, 10) !== startDate) return null;
  const addDays = (days: number) => {
    const date = new Date(initial.getTime());
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return {
    // Las fechas de BD son días completos. Redondear las FRONTERAS y no
    // cada duración por separado evita huecos/solapamientos entre medias semanas.
    startDate: addDays(Math.round((startWeek - 1) * 7)),
    endDate: addDays(Math.round((startWeek + durationWeeks - 1) * 7) - 1),
  };
}
