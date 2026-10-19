import { Inject, Injectable } from '@nestjs/common';
import { alias, and, asc, clients, count, desc, eq, ilike, inArray, isNull, isUuid, or, projects, sql, ticketHhRequests, tickets, users, type Database } from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type { TicketFilters, TicketListItem, TicketRepository, TicketSortableField } from '../../domain/repositories/ticket.repository';
import type { Ticket } from '../../domain/entities/ticket.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './ticket.persistence-mapper';

/** "Pablo Vega" → "PV" — réplica de `getUserInitials` (v1). */
function initials(firstName: string | null, lastName: string | null): string | null {
  const first = firstName?.trim().split(/\s+/)[0]?.charAt(0) ?? '';
  const last = lastName?.trim().split(/\s+/)[0]?.charAt(0) ?? '';
  const value = `${first}${last}`.toUpperCase();
  return value || null;
}

@Injectable()
export class DrizzleTicketRepository implements TicketRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<Ticket | null> {
    if (!isUuid(id)) return this.findByLegacyId(id, context);
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
    const developmentProjects = alias(projects, 'development_projects');
    const supportLeaders = alias(users, 'support_leaders');

    const pendingHh = db
      .select({
        ticketId: ticketHhRequests.ticketId,
        pendingCount: count().as('pending_hh_count'),
        pendingHours: sql<string>`coalesce(sum(${ticketHhRequests.hours}), 0)`.as('pending_hh_hours'),
      })
      .from(ticketHhRequests)
      .where(eq(ticketHhRequests.status, 'pending'))
      .groupBy(ticketHhRequests.ticketId)
      .as('pending_hh');

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: tickets.id,
          legacyId: tickets.legacyId,
          title: tickets.title,
          description: tickets.description,
          resolution: tickets.resolution,
          clientId: tickets.clientId,
          clientName: clients.companyName,
          projectId: tickets.projectId,
          projectName: projects.name,
          supportLeaderFirstName: supportLeaders.firstName,
          supportLeaderLastName: supportLeaders.lastName,
          developmentProjectId: tickets.developmentProjectId,
          developmentProjectName: developmentProjects.name,
          serviceType: tickets.serviceType,
          priority: tickets.priority,
          status: tickets.status,
          assigneeUserId: tickets.assigneeUserId,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          estimatedHours: tickets.estimatedHours,
          usedHours: tickets.usedHours,
          pendingHhRequestsCount: sql<number>`coalesce(${pendingHh.pendingCount}, 0)`,
          pendingHhHours: sql<string>`coalesce(${pendingHh.pendingHours}, 0)`,
          invoiceId: tickets.invoiceId,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .leftJoin(clients, eq(clients.id, tickets.clientId))
        .leftJoin(projects, eq(projects.id, tickets.projectId))
        .leftJoin(supportLeaders, eq(supportLeaders.id, projects.leaderUserId))
        .leftJoin(developmentProjects, eq(developmentProjects.id, tickets.developmentProjectId))
        .leftJoin(users, eq(users.id, tickets.assigneeUserId))
        .leftJoin(pendingHh, eq(pendingHh.ticketId, tickets.id))
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
      description: row.description,
      resolution: row.resolution,
      clientId: row.clientId,
      clientName: row.clientName,
      projectId: row.projectId,
      projectName: row.projectName,
      supportLeaderInitials: initials(row.supportLeaderFirstName, row.supportLeaderLastName),
      developmentProjectId: row.developmentProjectId,
      developmentProjectName: row.developmentProjectName,
      serviceType: row.serviceType,
      priority: row.priority,
      status: row.status,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assigneeFirstName ? `${row.assigneeFirstName} ${row.assigneeLastName ?? ''}`.trim() : null,
      estimatedHours: row.estimatedHours,
      usedHours: Number(row.usedHours),
      pendingHhRequestsCount: Number(row.pendingHhRequestsCount),
      pendingHhHours: Number(row.pendingHhHours),
      invoiceId: row.invoiceId,
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

  async findClosedUnbilledIds(projectIds: readonly string[], context?: TransactionContext): Promise<string[]> {
    if (projectIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        and(
          inArray(tickets.projectId, [...projectIds]),
          eq(tickets.status, 'closed'),
          isNull(tickets.invoiceId),
          isNull(tickets.deletedAt),
        ),
      );
    return rows.map((row) => row.id);
  }

  async linkToInvoice(ticketIds: readonly string[], invoiceId: string, context?: TransactionContext): Promise<void> {
    if (ticketIds.length === 0) return;
    const db = resolveDb(this.database, context);
    await db.update(tickets).set({ invoiceId, updatedAt: new Date() }).where(inArray(tickets.id, [...ticketIds]));
  }

  private buildWhere(filters: TicketFilters) {
    const conditions = [];
    if (!filters.includeDeleted) conditions.push(isNull(tickets.deletedAt));
    if (filters.clientId?.length) conditions.push(inArray(tickets.clientId, filters.clientId));
    // También como "Proyecto de desarrollo": la ficha de un contrato filtra por cada proyecto cubierto, y sus tickets se abren contra el proyecto contenedor de soporte con el cubierto en `development_project_id`.
    if (filters.projectId) {
      conditions.push(or(eq(tickets.projectId, filters.projectId), eq(tickets.developmentProjectId, filters.projectId)));
    }
    if (filters.assigneeUserId?.length) conditions.push(inArray(tickets.assigneeUserId, filters.assigneeUserId));
    // Subconsulta y no el join de `search`: el conteo total usa este mismo `where` sin joins.
    if (filters.leaderUserId?.length) {
      const ledProjects = this.database
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.leaderUserId, filters.leaderUserId));
      conditions.push(inArray(tickets.projectId, ledProjects));
    }
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      // El código visible ("IN0948"/"ME0012"/"OP0003") no se persiste: se arma en
      // `formatTicketCode` (ticket.mapper). Se replica aquí para poder buscarlo.
      // `lpad` trunca en Postgres, por eso solo se aplica bajo 4 dígitos.
      const digits = sql`regexp_replace(${tickets.legacyId}, '\\D', '', 'g')`;
      const code = sql<string>`(case ${tickets.serviceType} when 'improvement' then 'ME' when 'operational' then 'OP' else 'IN' end
        || case when length(${digits}) >= 4 then ${digits} else lpad(${digits}, 4, '0') end)`;
      conditions.push(or(ilike(tickets.title, term), ilike(tickets.legacyId, term), ilike(code, term)));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<TicketSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const column = { createdAt: tickets.createdAt, status: tickets.status, priority: tickets.priority }[sort.field];
    return [direction(column), desc(tickets.createdAt)];
  }
}
