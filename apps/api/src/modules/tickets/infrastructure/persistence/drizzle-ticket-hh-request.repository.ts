import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray, projects, ticketHhRequests, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  TicketHhRequestListItem,
  TicketHhRequestRepository,
} from '../../domain/repositories/ticket-hh-request.repository';
import type { TicketHhRequest } from '../../domain/entities/ticket-hh-request.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './ticket-hh-request.persistence-mapper';

@Injectable()
export class DrizzleTicketHhRequestRepository implements TicketHhRequestRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<TicketHhRequest | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(ticketHhRequests).where(eq(ticketHhRequests.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByHourEntryId(hourEntryId: string, context?: TransactionContext): Promise<TicketHhRequest | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(ticketHhRequests).where(eq(ticketHhRequests.hourEntryId, hourEntryId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForTicket(ticketId: string, context?: TransactionContext): Promise<TicketHhRequestListItem[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        id: ticketHhRequests.id,
        ticketId: ticketHhRequests.ticketId,
        projectId: ticketHhRequests.projectId,
        projectName: projects.name,
        userId: ticketHhRequests.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        date: ticketHhRequests.date,
        hours: ticketHhRequests.hours,
        note: ticketHhRequests.note,
        isOvertime: ticketHhRequests.isOvertime,
        status: ticketHhRequests.status,
        rejectionReason: ticketHhRequests.rejectionReason,
        reviewedByUserId: ticketHhRequests.reviewedByUserId,
        reviewedAt: ticketHhRequests.reviewedAt,
        hourEntryId: ticketHhRequests.hourEntryId,
        createdAt: ticketHhRequests.createdAt,
      })
      .from(ticketHhRequests)
      .leftJoin(projects, eq(projects.id, ticketHhRequests.projectId))
      .leftJoin(users, eq(users.id, ticketHhRequests.userId))
      .where(eq(ticketHhRequests.ticketId, ticketId))
      .orderBy(desc(ticketHhRequests.createdAt));

    const reviewerIds = [...new Set(rows.map((row) => row.reviewedByUserId).filter((id): id is string => Boolean(id)))];
    const reviewers = reviewerIds.length
      ? await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(inArray(users.id, reviewerIds))
      : [];
    const reviewerNameById = new Map(reviewers.map((r) => [r.id, `${r.firstName} ${r.lastName ?? ''}`.trim()]));

    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticketId,
      projectId: row.projectId,
      projectName: row.projectName,
      userId: row.userId,
      userFullName: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim(),
      date: row.date,
      hours: Number(row.hours),
      note: row.note,
      isOvertime: row.isOvertime,
      status: row.status,
      rejectionReason: row.rejectionReason,
      reviewedByUserId: row.reviewedByUserId,
      reviewedByFullName: row.reviewedByUserId ? (reviewerNameById.get(row.reviewedByUserId) ?? null) : null,
      reviewedAt: row.reviewedAt,
      hourEntryId: row.hourEntryId,
      createdAt: row.createdAt,
    }));
  }

  async save(request: TicketHhRequest, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(request);

    await db
      .insert(ticketHhRequests)
      .values({ id: request.id, ...values })
      .onConflictDoUpdate({ target: ticketHhRequests.id, set: values });
  }
}
