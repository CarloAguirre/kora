export interface ForecastHolidayReader {
  /** Fechas (día laboral excluido) entre `start` y `end`, inclusive. */
  listNonWorkingDates(start: Date, end: Date): Promise<Date[]>;
}

export const FORECAST_HOLIDAY_READER = Symbol('ForecastHolidayReader');
