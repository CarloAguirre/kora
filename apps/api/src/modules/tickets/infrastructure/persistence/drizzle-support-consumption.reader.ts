import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, hourEntries, inArray, isNull, lte, ne, or, projects, sql, ticketHhRequests, tickets, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  SupportConsumptionDay,
  SupportConsumptionReader,
  SupportContractHourEntry,
} from '../../application/ports/support-consumption-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/** `YYYY-MM-DD` para comparar contra columnas `date` sin corrimiento de zona horaria. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Ver `SupportConsumptionReader` para la definición de consumo. */
@Injectable()
export class DrizzleSupportConsumptionReader implements SupportConsumptionReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listDailyHours(
    projectIds: readonly string[],
    from: Date,
    to: Date | null,
    context?: TransactionContext,
  ): Promise<SupportConsumptionDay[]> {
    if (projectIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const ids = [...projectIds];
    const fromKey = isoDay(from);
    const toKey = to ? isoDay(to) : null;

    const [logged, unloggedRequests, undetailedTickets] = await Promise.all([
      // 1. Registros de horas aprobados, con o sin ticket.
      db
        .select({ day: sql<string>`${hourEntries.date}::text`, hours: sql<string>`sum(${hourEntries.hours})` })
        .from(hourEntries)
        .where(
          and(
            inArray(hourEntries.projectId, ids),
            eq(hourEntries.status, 'approved'),
            gte(hourEntries.date, from),
            to ? lte(hourEntries.date, to) : undefined,
          ),
        )
        .groupBy(hourEntries.date),
      // 2a. Solicitudes de HH aprobadas sin un registro de horas aprobado detrás.
      db
        .select({ day: sql<string>`${ticketHhRequests.date}::text`, hours: sql<string>`sum(${ticketHhRequests.hours})` })
        .from(ticketHhRequests)
        .innerJoin(tickets, eq(tickets.id, ticketHhRequests.ticketId))
        .leftJoin(hourEntries, eq(hourEntries.id, ticketHhRequests.hourEntryId))
        .where(
          and(
            inArray(tickets.projectId, ids),
            isNull(tickets.deletedAt),
            eq(ticketHhRequests.status, 'approved'),
            or(isNull(hourEntries.id), ne(hourEntries.status, 'approved')),
            gte(ticketHhRequests.date, from),
            to ? lte(ticketHhRequests.date, to) : undefined,
          ),
        )
        .groupBy(ticketHhRequests.date),
      // 2b. `used_hours` sin desglose diario (tickets migrados de la v1) — a la fecha de reporte.
      db
        .select({
          day: sql<string>`((${tickets.createdAt} at time zone 'America/Santiago')::date)::text`,
          hours: sql<string>`${tickets.usedHours} - coalesce((select sum(r.hours) from ${ticketHhRequests} r where r.ticket_id = ${tickets.id} and r.status = 'approved'), 0)`,
        })
        .from(tickets)
        .where(and(inArray(tickets.projectId, ids), isNull(tickets.deletedAt), gt(tickets.usedHours, '0'))),
    ]);

    const byDay = new Map<string, number>();
    const add = (day: string, hours: number) => {
      if (!(hours > 0) || day < fromKey || (toKey !== null && day > toKey)) return;
      byDay.set(day, (byDay.get(day) ?? 0) + hours);
    };
    for (const row of logged) add(row.day, Number(row.hours));
    for (const row of unloggedRequests) add(row.day, Number(row.hours));
    for (const row of undetailedTickets) add(row.day, Number(row.hours));

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }));
  }

  async listEntriesWithoutTicket(
    projectIds: readonly string[],
    from: Date,
    to: Date | null,
    context?: TransactionContext,
  ): Promise<SupportContractHourEntry[]> {
    if (projectIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        id: hourEntries.id,
        day: sql<string>`${hourEntries.date}::text`,
        hours: hourEntries.hours,
        projectId: projects.id,
        projectName: projects.name,
        firstName: users.firstName,
        lastName: users.lastName,
        category: hourEntries.category,
        description: hourEntries.description,
        fromDeletedTicket: sql<boolean>`exists (select 1 from ${ticketHhRequests} r join ${tickets} t on t.id = r.ticket_id where r.hour_entry_id = ${hourEntries.id} and t.deleted_at is not null)`,
      })
      .from(hourEntries)
      .innerJoin(projects, eq(projects.id, hourEntries.projectId))
      .leftJoin(users, eq(users.id, hourEntries.userId))
      .where(
        and(
          inArray(hourEntries.projectId, [...projectIds]),
          eq(hourEntries.status, 'approved'),
          gte(hourEntries.date, from),
          to ? lte(hourEntries.date, to) : undefined,
          sql`not exists (select 1 from ${ticketHhRequests} r join ${tickets} t on t.id = r.ticket_id where r.hour_entry_id = ${hourEntries.id} and r.status = 'approved' and t.deleted_at is null)`,
        ),
      )
      .orderBy(asc(hourEntries.date), asc(projects.name), asc(users.firstName));

    return rows.map((row) => ({
      id: row.id,
      date: row.day,
      hours: Number(row.hours),
      projectId: row.projectId,
      projectName: row.projectName,
      userFullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
      category: row.category,
      description: row.description,
      fromDeletedTicket: Boolean(row.fromDeletedTicket),
    }));
  }
}
