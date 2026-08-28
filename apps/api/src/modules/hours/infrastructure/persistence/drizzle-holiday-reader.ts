import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, holidays as holidaysTable, lte, type Database } from '@kora/db';
import type { Holiday } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `holidays` es un catálogo compartido sin dueño de dominio propio — igual
 * criterio que `DrizzleForecastHolidayReader` (M6): se consulta directo, sin
 * caso de uso de por medio, pero desde infraestructura, no desde el
 * controlador (`architecture.spec.ts`, "la presentación no consulta la base
 * directamente").
 */
@Injectable()
export class DrizzleHolidayReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(dateFrom: string | undefined, dateTo: string | undefined): Promise<Holiday[]> {
    const conditions = [eq(holidaysTable.isWorkingDay, false)];
    if (dateFrom) conditions.push(gte(holidaysTable.date, parseIsoDate(dateFrom)));
    if (dateTo) conditions.push(lte(holidaysTable.date, parseIsoDate(dateTo)));

    const rows = await this.db
      .select({
        id: holidaysTable.id,
        date: holidaysTable.date,
        name: holidaysTable.name,
        type: holidaysTable.type,
        isWorkingDay: holidaysTable.isWorkingDay,
      })
      .from(holidaysTable)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      date: toIsoDate(row.date),
      name: row.name,
      type: row.type,
      isWorkingDay: row.isWorkingDay,
    }));
  }
}
