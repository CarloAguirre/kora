import type { MissingHoursDay } from '../../../shared/application/ports/notification.port';

/** Jornada esperada por día hábil. */
export const EXPECTED_HOURS_PER_DAY = 8;
/** Cuántos días hacia atrás (contando hoy) se revisan: un hueco viejo deja de recordarse al salir de la ventana. */
export const MISSING_HOURS_LOOKBACK_DAYS = 30;

/**
 * Días hábiles (`workingDays`, ya sin fines de semana ni feriados) con menos de
 * la jornada registrada. Nunca cuenta días anteriores al primer registro de la
 * persona: quien entró hace una semana no tiene huecos previos a su llegada.
 * La comparten el correo de las 18:00 y los pendientes de la campanita.
 */
export function findMissingHourDays(
  workingDays: readonly string[],
  firstEntryDate: string,
  hoursOn: (date: string) => number,
): MissingHoursDay[] {
  return workingDays
    .filter((day) => day >= firstEntryDate)
    .map((date) => ({ date, hoursRegistered: hoursOn(date) }))
    .filter((day) => day.hoursRegistered < EXPECTED_HOURS_PER_DAY);
}
