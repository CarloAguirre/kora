import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, ticketHistoryEntries, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  AppendTicketHistoryEntry,
  TicketHistoryEntryRecord,
  TicketHistoryRepository,
} from '../../domain/repositories/ticket-history.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleTicketHistoryRepository implements TicketHistoryRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async append(entry: AppendTicketHistoryEntry, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.insert(ticketHistoryEntries).values({
      ticketId: entry.ticketId,
      eventType: entry.eventType,
      description: entry.description,
      metadata: entry.metadata ?? {},
      actorUserId: entry.actorUserId,
      occurredAt: entry.occurredAt,
    });
  }

  async listForTicket(ticketId: string, context?: TransactionContext): Promise<TicketHistoryEntryRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        id: ticketHistoryEntries.id,
        ticketId: ticketHistoryEntries.ticketId,
        eventType: ticketHistoryEntries.eventType,
        description: ticketHistoryEntries.description,
        metadata: ticketHistoryEntries.metadata,
        actorUserId: ticketHistoryEntries.actorUserId,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
        occurredAt: ticketHistoryEntries.occurredAt,
      })
      .from(ticketHistoryEntries)
      .leftJoin(users, eq(users.id, ticketHistoryEntries.actorUserId))
      .where(eq(ticketHistoryEntries.ticketId, ticketId))
      .orderBy(asc(ticketHistoryEntries.occurredAt));

    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticketId,
      eventType: row.eventType,
      description: row.description,
      metadata: row.metadata as Record<string, unknown>,
      actorUserId: row.actorUserId,
      actorName: row.actorFirstName ? `${row.actorFirstName} ${row.actorLastName ?? ''}`.trim() : null,
      occurredAt: row.occurredAt,
    }));
  }
}
