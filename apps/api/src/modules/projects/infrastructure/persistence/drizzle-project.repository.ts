import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  clients,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  projectTeamMembers,
  projectTeams,
  projects,
  sql,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type {
  ProjectFilters,
  ProjectListItem,
  ProjectRepository,
  ProjectSortableField,
} from '../../domain/repositories/project.repository';
import type { Project } from '../../domain/entities/project.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './project.persistence-mapper';

@Injectable()
export class DrizzleProjectRepository implements ProjectRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<Project | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Project | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(projects).where(eq(projects.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async search(
    filters: ProjectFilters,
    page: PageRequest,
    sort: SortRequest<ProjectSortableField>,
    context?: TransactionContext,
  ): Promise<Page<ProjectListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    const memberStatsSubquery = db
      .select({
        projectId: projectTeamMembers.projectId,
        assignedMemberCount: count().as('assigned_member_count'),
        plannedHours: sql<string>`coalesce(sum(${projectTeamMembers.assignedHours}), 0)`.as('planned_hours'),
      })
      .from(projectTeamMembers)
      .groupBy(projectTeamMembers.projectId)
      .as('member_stats');

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          clientId: projects.clientId,
          clientName: clients.companyName,
          type: projects.type,
          salesStage: projects.salesStage,
          status: projects.status,
          phase: projects.phase,
          priority: projects.priority,
          leaderUserId: projects.leaderUserId,
          leaderFirstName: users.firstName,
          leaderLastName: users.lastName,
          soldHours: projects.soldHours,
          usedHours: projects.usedHours,
          assignedMemberCount: sql<number>`coalesce(${memberStatsSubquery.assignedMemberCount}, 0)`,
          plannedHours: sql<string>`coalesce(${memberStatsSubquery.plannedHours}, 0)`,
          startDate: projects.startDate,
          endDate: projects.endDate,
          actualProgress: projects.actualProgress,
          supportPlanDescription: projects.supportPlanDescription,
          supportHours: projects.supportHours,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .leftJoin(users, eq(users.id, projects.leaderUserId))
        .leftJoin(memberStatsSubquery, eq(memberStatsSubquery.projectId, projects.id))
        .where(where)
        .orderBy(...this.buildOrderBy(sort))
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db.select({ value: count() }).from(projects).where(where),
    ]);

    const items: ProjectListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      clientId: row.clientId,
      clientName: row.clientName,
      type: row.type,
      salesStage: row.salesStage,
      status: row.status,
      phase: row.phase,
      priority: row.priority,
      leaderUserId: row.leaderUserId,
      leaderName: row.leaderFirstName ? `${row.leaderFirstName} ${row.leaderLastName ?? ''}`.trim() : null,
      soldHours: Number(row.soldHours),
      usedHours: Number(row.usedHours),
      assignedMemberCount: Number(row.assignedMemberCount),
      plannedHours: Number(row.plannedHours),
      startDate: row.startDate,
      endDate: row.endDate,
      actualProgress: row.actualProgress,
      supportPlanDescription: row.supportPlanDescription,
      supportHours: Number(row.supportHours),
      createdAt: row.createdAt,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async save(project: Project, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(project);

    await db
      .insert(projects)
      .values({ id: project.id, ...values })
      .onConflictDoUpdate({ target: projects.id, set: values });
  }

  async nameIsTakenByAnother(
    name: string,
    clientId: string | null,
    excludingProjectId: string | null,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const conditions = [
      sql`lower(btrim(${projects.name})) = lower(btrim(${name}))`,
      clientId ? eq(projects.clientId, clientId) : isNull(projects.clientId),
      isNull(projects.deletedAt),
    ];
    if (excludingProjectId) conditions.push(ne(projects.id, excludingProjectId));

    const rows = await db.select({ id: projects.id }).from(projects).where(and(...conditions)).limit(1);
    return rows.length > 0;
  }

  async countActiveForClient(clientId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.status, 'active'), isNull(projects.deletedAt)));
    return rows[0]?.value ?? 0;
  }

  async countActiveLedByUser(userId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);

    // Lidera el proyecto o está asignado como miembro con actividad activa —
    // cualquiera de las dos cuenta como "tiene proyectos activos a cargo".
    const rows = await db
      .select({ value: count() })
      .from(projects)
      .leftJoin(projectTeamMembers, eq(projectTeamMembers.projectId, projects.id))
      .leftJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
      .where(
        and(
          eq(projects.status, 'active'),
          isNull(projects.deletedAt),
          or(eq(projects.leaderUserId, userId), eq(teamMembers.userId, userId)),
        ),
      );

    return rows[0]?.value ?? 0;
  }

  async isProjectLeaderOrTeamLeader(projectId: string, userId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          or(
            eq(projects.leaderUserId, userId),
            exists(
              db
                .select({ id: projectTeams.id })
                .from(projectTeams)
                .innerJoin(teams, eq(teams.id, projectTeams.teamId))
                .where(and(eq(projectTeams.projectId, projectId), eq(teams.leaderUserId, userId))),
            ),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async isProjectLeaderOrTeamLeaderOfMember(
    projectId: string,
    actorUserId: string,
    memberUserId: string,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          or(
            eq(projects.leaderUserId, actorUserId),
            exists(
              db
                .select({ id: projectTeams.id })
                .from(projectTeams)
                .innerJoin(teams, eq(teams.id, projectTeams.teamId))
                .innerJoin(
                  teamMembers,
                  and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, memberUserId), isNull(teamMembers.leftAt)),
                )
                .where(
                  and(
                    eq(projectTeams.projectId, projectId),
                    // Líder del equipo PARA ESTE PROYECTO (override), con
                    // el líder orgánico del equipo como respaldo — un mismo
                    // equipo puede tener un líder distinto por proyecto (ver
                    // `ProjectTeamRepository`/`UpsertProjectTeamInput.leaderUserId`).
                    sql`coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId}) = ${actorUserId}`,
                  ),
                ),
            ),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async findApproverCandidatesForMember(
    projectId: string,
    memberUserId: string,
    context?: TransactionContext,
  ): Promise<{ id: string; fullName: string }[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.leaderUserId))
      .where(eq(projects.id, projectId))
      .unionAll(
        db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(projectTeams)
          .innerJoin(teams, eq(teams.id, projectTeams.teamId))
          .innerJoin(users, sql`${users.id} = coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId})`)
          .innerJoin(
            teamMembers,
            and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, memberUserId), isNull(teamMembers.leftAt)),
          )
          .where(eq(projectTeams.projectId, projectId)),
      );

    const byId = new Map<string, { id: string; fullName: string }>();
    for (const row of rows) {
      if (!row.id) continue;
      byId.set(row.id, { id: row.id, fullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() });
    }
    return [...byId.values()];
  }

  private buildWhere(filters: ProjectFilters) {
    const conditions = [];
    if (!filters.includeDeleted) conditions.push(isNull(projects.deletedAt));
    if (filters.type) conditions.push(eq(projects.type, filters.type));
    if (filters.status?.length) conditions.push(inArray(projects.status, filters.status));
    if (filters.phase?.length) conditions.push(inArray(projects.phase, filters.phase));
    if (filters.clientId) conditions.push(eq(projects.clientId, filters.clientId));
    if (filters.leaderUserId?.length) conditions.push(inArray(projects.leaderUserId, filters.leaderUserId));
    if (filters.search) {
      conditions.push(ilike(projects.name, `%${filters.search.trim()}%`));
    }
    if (filters.assignedToUserId) {
      // Lidera, desarrolla, es el responsable comercial, o está asignado como miembro del proyecto.
      conditions.push(
        or(
          eq(projects.leaderUserId, filters.assignedToUserId),
          eq(projects.developerUserId, filters.assignedToUserId),
          eq(projects.commercialManagerUserId, filters.assignedToUserId),
          sql`exists (
            select 1 from ${projectTeamMembers}
            inner join ${teamMembers} on ${teamMembers.id} = ${projectTeamMembers.teamMemberId}
            where ${projectTeamMembers.projectId} = ${projects.id}
              and ${teamMembers.userId} = ${filters.assignedToUserId}
          )`,
        ),
      );
    }
    if (filters.teamId) {
      // `project_teams` (migrada desde `equipo_proyecto` de la v1) es la
      // relación equipo↔proyecto real — no `project_team_members` (migrada
      // desde `proyecto_colaborador`), que es la asignación de colaboradores
      // individuales y es un subconjunto mucho más angosto.
      conditions.push(
        sql`exists (
          select 1 from ${projectTeams}
          where ${projectTeams.projectId} = ${projects.id}
            and ${projectTeams.teamId} = ${filters.teamId}
        )`,
      );
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<ProjectSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const sqlDirection = sort.direction === 'desc' ? sql`desc` : sql`asc`;

    if (sort.field === 'priority') {
      // El enum project_priority se declaró en orden low < medium < high, así
      // que ordenar por la columna basta para respetar la severidad; los
      // proyectos sin prioridad quedan siempre al final, sin importar la dirección.
      return [sql`${projects.priority} ${sqlDirection} nulls last`, desc(projects.createdAt), asc(projects.id)];
    }

    if (sort.field === 'client') {
      return [sql`${clients.companyName} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    if (sort.field === 'leader') {
      return [sql`${users.firstName} ${sqlDirection} nulls last`, sql`${users.lastName} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    if (sort.field === 'startDate') {
      return [sql`${projects.startDate} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    if (sort.field === 'endDate') {
      return [sql`${projects.endDate} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    if (sort.field === 'progress') {
      return [sql`${projects.actualProgress} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    if (sort.field === 'supportPlan') {
      return [sql`${projects.supportPlanDescription} ${sqlDirection} nulls last`, asc(projects.id)];
    }

    // Restantes = vendidas menos consumidas — desarrollo usa `soldHours`,
    // soporte usa `supportHours`, así que se elige según el tipo de proyecto
    // de cada fila en vez de asumir que la consulta ya viene filtrada por uno.
    if (sort.field === 'remainingHours') {
      return [
        sql`(case when ${projects.type} = 'support' then ${projects.supportHours} else ${projects.soldHours} end - ${projects.usedHours}) ${sqlDirection}`,
        asc(projects.id),
      ];
    }

    if (sort.field === 'deviationHours') {
      return [sql`(${projects.usedHours} - ${projects.supportHours}) ${sqlDirection}`, asc(projects.id)];
    }

    const column =
      sort.field === 'name'
        ? projects.name
        : sort.field === 'status'
          ? projects.status
          : sort.field === 'soldHours'
            ? projects.soldHours
            : sort.field === 'usedHours'
              ? projects.usedHours
              : sort.field === 'supportHours'
                ? projects.supportHours
                : projects.createdAt;
    return [direction(column), asc(projects.id)];
  }
}
