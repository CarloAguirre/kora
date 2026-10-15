import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  clients,
  count,
  desc,
  eq,
  gte,
  hourEntries,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  projectModules,
  projects,
  projectTeams,
  sql,
  teamMembers,
  teams,
  ticketHhRequests,
  tickets,
  users,
  type Database,
} from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type {
  HourEntryFilters,
  HourEntryListItem,
  HourEntryRepository,
  HourEntrySortableField,
  OvertimeHoursByUser,
} from '../../domain/repositories/hour-entry.repository';
import type { HourEntry } from '../../domain/entities/hour-entry.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './hour-entry.persistence-mapper';

@Injectable()
export class DrizzleHourEntryRepository implements HourEntryRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<HourEntry | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(hourEntries).where(eq(hourEntries.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: string, context?: TransactionContext): Promise<HourEntry | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(hourEntries).where(eq(hourEntries.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async search(
    filters: HourEntryFilters,
    page: PageRequest,
    sort: SortRequest<HourEntrySortableField>,
    context?: TransactionContext,
  ): Promise<Page<HourEntryListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: hourEntries.id,
          userId: hourEntries.userId,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          projectId: hourEntries.projectId,
          projectName: projects.name,
          projectLeaderUserId: projects.leaderUserId,
          projectType: projects.type,
          projectSalesStage: projects.salesStage,
          clientId: projects.clientId,
          clientName: clients.companyName,
          moduleId: hourEntries.moduleId,
          moduleName: projectModules.name,
          assignment: hourEntries.assignment,
          category: hourEntries.category,
          description: hourEntries.description,
          hours: hourEntries.hours,
          date: hourEntries.date,
          isOvertime: hourEntries.isOvertime,
          projectStageAtEntry: hourEntries.projectStageAtEntry,
          status: hourEntries.status,
          rejectionReason: hourEntries.rejectionReason,
          hasBlocker: hourEntries.hasBlocker,
          blockerDescription: hourEntries.blockerDescription,
          designatedApproverUserId: hourEntries.designatedApproverUserId,
          decisionUserId: hourEntries.decisionUserId,
          createdAt: hourEntries.createdAt,
          ticketId: tickets.id,
          ticketLegacyId: tickets.legacyId,
        })
        .from(hourEntries)
        .leftJoin(users, eq(users.id, hourEntries.userId))
        .leftJoin(projects, eq(projects.id, hourEntries.projectId))
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .leftJoin(projectModules, eq(projectModules.id, hourEntries.moduleId))
        // Un `hour_entries` viene de a lo más UNA solicitud de HH de ticket
        // (índice único parcial en `ticket_hh_requests.hour_entry_id`), así
        // que este join no duplica filas.
        .leftJoin(ticketHhRequests, eq(ticketHhRequests.hourEntryId, hourEntries.id))
        .leftJoin(tickets, eq(tickets.id, ticketHhRequests.ticketId))
        .where(where)
        .orderBy(...this.buildOrderBy(sort))
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db.select({ value: count() }).from(hourEntries).leftJoin(users, eq(users.id, hourEntries.userId)).where(where),
    ]);

    const authorIds = [...new Set(rows.map((row) => row.userId))];
    const teamRows = authorIds.length
      ? await db
          .select({ userId: teamMembers.userId, teamId: teams.id, teamName: teams.name, teamLeaderUserId: teams.leaderUserId })
          .from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(and(inArray(teamMembers.userId, authorIds), isNull(teamMembers.leftAt)))
      : [];
    // Una persona podría (raro) tener más de una membresía activa; se muestra la primera.
    const teamByUserId = new Map(
      teamRows.map((row) => [row.userId, { id: row.teamId, name: row.teamName, leaderUserId: row.teamLeaderUserId }]),
    );

    const projectIds = [...new Set(rows.map((row) => row.projectId).filter((id): id is string => Boolean(id)))];
    const authorTeamIds = [...new Set([...teamByUserId.values()].map((team) => team.id))];
    // Qué pares (proyecto, equipo) están realmente asignados — el líder de un
    // equipo solo aprueba las horas de SU propio equipo, no las de cualquier
    // otro equipo asignado al mismo proyecto.
    const assignedProjectTeamRows =
      projectIds.length && authorTeamIds.length
        ? await db
            .select({
              projectId: projectTeams.projectId,
              teamId: projectTeams.teamId,
              // Líder del equipo PARA ESTE PROYECTO — distinto del líder
              // orgánico del equipo (`teams.leaderUserId`); un mismo equipo
              // puede tener un líder distinto por proyecto (ver
              // `ProjectTeamRepository`/`UpsertProjectTeamInput.leaderUserId`).
              projectTeamLeaderUserId: projectTeams.leaderUserId,
            })
            .from(projectTeams)
            .where(and(inArray(projectTeams.projectId, projectIds), inArray(projectTeams.teamId, authorTeamIds)))
        : [];
    const assignedProjectTeamLeaderId = new Map(
      assignedProjectTeamRows.map((row) => [`${row.projectId}:${row.teamId}`, row.projectTeamLeaderUserId]),
    );

    // EXCLUYENTE (DECISION-M4-HORAS.md "Tercera corrección"): el líder del
    // propio equipo del autor, si ese equipo está asignado al proyecto —
    // tomado primero desde el override por-proyecto y, si no hay, desde el
    // líder orgánico. El líder del proyecto solo aparece cuando el autor no
    // tiene líder de equipo resoluble; mismo criterio que
    // `ProjectRepository.isProjectLeaderOrTeamLeaderOfMember`, que decide
    // quién puede aprobar de verdad — este cálculo es solo para mostrar
    // "pendiente con quién" en el listado, y debe coincidir.
    const projectApproverIdsByEntryId = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.projectId) continue;
      let teamLeaderId: string | null = null;
      const authorTeam = teamByUserId.get(row.userId);
      if (authorTeam) {
        const pairKey = `${row.projectId}:${authorTeam.id}`;
        if (assignedProjectTeamLeaderId.has(pairKey)) {
          teamLeaderId = assignedProjectTeamLeaderId.get(pairKey) ?? authorTeam.leaderUserId;
        }
      }
      const approverId = teamLeaderId ?? row.projectLeaderUserId;
      if (approverId) projectApproverIdsByEntryId.set(row.id, new Set([approverId]));
    }

    const approverIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.designatedApproverUserId, row.decisionUserId])
          .concat([...projectApproverIdsByEntryId.values()].flatMap((set) => [...set]))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const approverNames = approverIds.length
      ? await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(inArray(users.id, approverIds))
      : [];
    const approverNameById = new Map(approverNames.map((a) => [a.id, `${a.firstName} ${a.lastName ?? ''}`.trim()]));
    const projectApproversByEntryId = new Map(
      [...projectApproverIdsByEntryId.entries()].map(([entryId, ids]) => [
        entryId,
        [...ids].map((id) => ({ id, fullName: approverNameById.get(id) ?? '' })),
      ]),
    );

    const items: HourEntryListItem[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userFullName: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim(),
      projectId: row.projectId,
      projectName: row.projectName,
      moduleId: row.moduleId,
      moduleName: row.moduleName,
      teamId: teamByUserId.get(row.userId)?.id ?? null,
      teamName: teamByUserId.get(row.userId)?.name ?? null,
      assignment: row.assignment,
      category: row.category,
      description: row.description,
      hours: Number(row.hours),
      date: row.date,
      isOvertime: row.isOvertime,
      projectStageAtEntry: row.projectStageAtEntry,
      status: row.status,
      rejectionReason: row.rejectionReason,
      hasBlocker: row.hasBlocker,
      blockerDescription: row.blockerDescription,
      designatedApproverUserId: row.designatedApproverUserId,
      designatedApproverFullName: row.designatedApproverUserId ? (approverNameById.get(row.designatedApproverUserId) ?? null) : null,
      projectApprovers: projectApproversByEntryId.get(row.id) ?? [],
      createdAt: row.createdAt,
      ticket: row.ticketId ? { id: row.ticketId, legacyId: row.ticketLegacyId } : null,
      decisionUserId: row.decisionUserId,
      decisionByFullName: row.decisionUserId ? (approverNameById.get(row.decisionUserId) ?? null) : null,
      clientId: row.clientId,
      clientName: row.clientName,
      projectType: row.projectType,
      projectSalesStage: row.projectSalesStage,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async save(entry: HourEntry, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(entry);

    await db
      .insert(hourEntries)
      .values({ id: entry.id, ...values })
      .onConflictDoUpdate({ target: hourEntries.id, set: values });
  }

  async delete(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(hourEntries).where(eq(hourEntries.id, id));
  }

  async sumApprovedHoursForProject(projectId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)` })
      .from(hourEntries)
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.status, 'approved')));
    return Number(rows[0]?.total ?? 0);
  }

  async sumApprovedHoursForProjects(
    projectIds: readonly string[],
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<number> {
    if (projectIds.length === 0) return 0;
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)` })
      .from(hourEntries)
      .where(
        and(
          inArray(hourEntries.projectId, [...projectIds]),
          eq(hourEntries.status, 'approved'),
          gte(hourEntries.date, dateFrom),
          lte(hourEntries.date, dateTo),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async sumOvertimeHoursByUserForProjects(
    projectIds: readonly string[],
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<OvertimeHoursByUser[]> {
    if (projectIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        userId: hourEntries.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        approved: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'approved'), 0)`,
        pending: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'pending'), 0)`,
      })
      .from(hourEntries)
      .innerJoin(users, eq(users.id, hourEntries.userId))
      .where(
        and(
          inArray(hourEntries.projectId, [...projectIds]),
          eq(hourEntries.isOvertime, true),
          ne(hourEntries.status, 'rejected'),
          gte(hourEntries.date, dateFrom),
          lte(hourEntries.date, dateTo),
        ),
      )
      .groupBy(hourEntries.userId, users.firstName, users.lastName);
    return rows
      .map((row) => ({
        userId: row.userId,
        userFullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
        approvedHours: Number(row.approved),
        pendingHours: Number(row.pending),
      }))
      .sort((a, b) => b.approvedHours + b.pendingHours - (a.approvedHours + a.pendingHours));
  }

  async sumRegularHoursForUserAndDate(userId: string, date: Date, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)` })
      .from(hourEntries)
      .where(
        and(
          eq(hourEntries.userId, userId),
          eq(hourEntries.date, date),
          eq(hourEntries.isOvertime, false),
          ne(hourEntries.status, 'rejected'),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  private buildWhere(filters: HourEntryFilters) {
    const conditions = [];
    if (filters.userId) conditions.push(eq(hourEntries.userId, filters.userId));
    if (filters.projectId) conditions.push(eq(hourEntries.projectId, filters.projectId));
    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(ilike(users.firstName, term), ilike(users.lastName, term)));
    }
    if (filters.status) conditions.push(eq(hourEntries.status, filters.status));
    if (filters.teamId) {
      conditions.push(
        sql`exists (
          select 1 from ${teamMembers}
          where ${teamMembers.userId} = ${hourEntries.userId}
            and ${teamMembers.teamId} = ${filters.teamId}
            and ${teamMembers.leftAt} is null
        )`,
      );
    }
    if (filters.dateFrom) conditions.push(gte(hourEntries.date, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(hourEntries.date, filters.dateTo));
    if (filters.visibleToUserIds) {
      conditions.push(
        filters.visibleToUserIds.length > 0 ? inArray(hourEntries.userId, [...filters.visibleToUserIds]) : sql`false`,
      );
    }
    if (filters.leaderScopeUserId) {
      const leaderId = filters.leaderScopeUserId;
      conditions.push(
        or(
          eq(hourEntries.userId, leaderId),
          // Sin proyecto: mismo criterio amplio que la autoridad de decisión
          // para estos registros — lidera al dueño en general (no hay
          // proyecto que acote).
          sql`(
            ${hourEntries.projectId} is null
            and exists (
              select 1 from ${teamMembers}
              inner join ${teams} on ${teams.id} = ${teamMembers.teamId}
              where ${teamMembers.userId} = ${hourEntries.userId}
                and ${teamMembers.leftAt} is null
                and (
                  ${teams.leaderUserId} = ${leaderId}
                  or exists (
                    select 1 from ${projectTeams}
                    where ${projectTeams.teamId} = ${teams.id} and ${projectTeams.leaderUserId} = ${leaderId}
                  )
                )
            )
          )`,
          // Con proyecto, EXCLUYENTE: solo el líder del equipo del dueño
          // PARA ESE PROYECTO — no cualquier equipo que lidere en general.
          sql`(
            ${hourEntries.projectId} is not null
            and exists (
              select 1 from ${projectTeams}
              inner join ${teams} on ${teams.id} = ${projectTeams.teamId}
              inner join ${teamMembers} on ${teamMembers.teamId} = ${teams.id}
                and ${teamMembers.userId} = ${hourEntries.userId} and ${teamMembers.leftAt} is null
              where ${projectTeams.projectId} = ${hourEntries.projectId}
                and coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId}) = ${leaderId}
            )
          )`,
          // Con proyecto y SIN líder de equipo resoluble para el dueño: cae
          // al líder del proyecto — mismo respaldo que la autoridad de
          // decisión.
          sql`(
            ${hourEntries.projectId} is not null
            and exists (select 1 from ${projects} where ${projects.id} = ${hourEntries.projectId} and ${projects.leaderUserId} = ${leaderId})
            and not exists (
              select 1 from ${projectTeams}
              inner join ${teams} on ${teams.id} = ${projectTeams.teamId}
              inner join ${teamMembers} on ${teamMembers.teamId} = ${teams.id}
                and ${teamMembers.userId} = ${hourEntries.userId} and ${teamMembers.leftAt} is null
              where ${projectTeams.projectId} = ${hourEntries.projectId}
                and coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId}) is not null
            )
          )`,
        ),
      );
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<HourEntrySortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const column = { date: hourEntries.date, createdAt: hourEntries.createdAt, status: hourEntries.status, hours: hourEntries.hours }[
      sort.field
    ];
    return [direction(column), desc(hourEntries.createdAt)];
  }
}
