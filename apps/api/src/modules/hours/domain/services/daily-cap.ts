/** Jornada diaria — lo que un colaborador registra sobre este total en un día queda como horas extra. */
export const DAILY_CAP_HOURS = 8;

export interface HoursTranche {
  readonly hours: number;
  readonly isOvertime: boolean;
}

const roundHours = (value: number) => Math.round(value * 100) / 100;

/**
 * Divide las horas pedidas en el tramo que aún cabe en la jornada de
 * `DAILY_CAP_HOURS` (normales) y el resto (horas extra). Devuelve uno o dos
 * tramos, nunca uno de 0h. Misma regla en Horas (`CreateHourEntryUseCase`,
 * `UpdateHourEntryUseCase`) y en las solicitudes de HH de ticket
 * (`CreateTicketHhRequestUseCase`), así Capacity (solo horas normales) nunca
 * pasa de 8h en un día y el excedente aparece en "Horas Extras".
 */
export function splitByDailyCap(requestedHours: number, regularHoursForDate: number): HoursTranche[] {
  const regularHours = roundHours(Math.min(requestedHours, Math.max(0, DAILY_CAP_HOURS - regularHoursForDate)));
  const overtimeHours = roundHours(requestedHours - regularHours);
  const tranches: HoursTranche[] = [];
  if (regularHours > 0) tranches.push({ hours: regularHours, isOvertime: false });
  if (overtimeHours > 0) tranches.push({ hours: overtimeHours, isOvertime: true });
  return tranches;
}
