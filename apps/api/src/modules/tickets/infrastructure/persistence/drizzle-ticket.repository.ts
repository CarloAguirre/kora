import { Inject, Injectable } from '@nestjs/common';
import { and, asc, clients, count, desc, eq, ilike, isNull, or, projects, tickets, users, type Database } from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type { TicketFilters, TicketListItem, TicketRepository, TicketSortableField } from '../../domain/repositories/ticket.repository';
import type { Ticket } from '../../domain/entities/ticket.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './ticket.persistence-mapper';

@Injectable()
export class DrizzleTicketRepository implements TicketRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<Ticket | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: string, context?: TransactionContext): Promise<Ticket | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(tickets).where(eq(tickets.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async search(
    filters: TicketFilters,
    page: PageRequest,
    sort: SortRequest<TicketSortableField>,
    context?: TransactionContext,
  ): Promise<Page<TicketListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: tickets.id,
          legacyId: tickets.legacyId,
          title: tickets.title,
          clientId: tickets.clientId,
          clientName: clients.companyName,
          projectId: tickets.projectId,
          projectName: projects.name,
          serviceType: tickets.serviceType,
          priority: tickets.priority,
          status: tickets.status,
          assigneeUserId: tickets.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          estimatedHours: tickets.estimatedHours,
          usedHours: tickets.usedHours,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .leftJoin(clients, eq(clients.id, tickets.clientId))
        .leftJoin(projects, eq(projects.id, tickets.projectId))
        .leftJoin(users, eq(users.id, tickets.assigneeUserId))
        .where(where)
        .orderBy(...this.buildOrderBy(sort))
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db.select({ value: count() }).from(tickets).where(where),
    ]);

    const items: TicketListItem[] = rows.map((row) => ({
      id: row.id,
      legacyId: row.legacyId,
      title: row.title,
      clientId: row.clientId,
      clientName: row.clientName,
      projectId: row.projectId,
      projectName: row.projectName,
      serviceType: row.serviceType,
      priority: row.priority,
      status: row.status,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assigneeFirstName ? `${row.assigneeFirstName} ${row.assigneeLastName ?? ''}`.trim() : null,
      estimatedHours: row.estimatedHours,
      usedHours: Number(row.usedHours),
      createdAt: row.createdAt,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async save(ticket: Ticket, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(ticket);

    await db
      .insert(tickets)
      .values({ id: ticket.id, ...values })
      .onConflictDoUpdate({ target: tickets.id, set: values });
  }

  private buildWhere(filters: TicketFilters) {
    const conditions = [];
    if (!filters.includeDeleted) conditions.push(isNull(tickets.deletedAt));
    if (filters.clientId) conditions.push(eq(tickets.clientId, filters.clientId));
    if (filters.projectId) conditions.push(eq(tickets.projectId, filters.projectId));
    if (filters.assigneeUserId) conditions.push(eq(tickets.assigneeUserId, filters.assigneeUserId));
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(ilike(tickets.title, term), ilike(tickets.legacyId, term)));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<TicketSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const column = { createdAt: tickets.createdAt, status: tickets.status, priority: tickets.priority }[sort.field];
    return [direction(column), desc(tickets.createdAt)];
  }
}
