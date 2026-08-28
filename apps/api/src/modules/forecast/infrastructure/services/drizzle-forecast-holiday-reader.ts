import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, holidays, lte, type Database } from '@kora/db';
import type { ForecastHolidayReader } from '../../application/ports/forecast-holiday-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

/**
 * `holidays` es un catálogo compartido sin módulo propio (ver
 * docs/DECISION-M6-FORECAST.md) — se consulta directo, igual que cualquier
 * otra tabla de catálogo.
 */
@Injectable()
export class DrizzleForecastHolidayReader implements ForecastHolidayReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listNonWorkingDates(start: Date, end: Date): Promise<Date[]> {
    const rows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(eq(holidays.isWorkingDay, false), gte(holidays.date, start), lte(holidays.date, end)));

    return rows.map((row) => row.date);
  }
}
