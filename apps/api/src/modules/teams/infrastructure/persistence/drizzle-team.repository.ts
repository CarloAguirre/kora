import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  hourEntries,
  ilike,
  inArray,
  isNull,
  isUuid,
  lte,
  ne,
  or,
  projectTeams,
  sql,
  teamMembers,
  teams,
  teamTypes,
  users,
  type Database,
} from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type {
  TeamFilters,
  TeamListItem,
  TeamRepository,
  TeamSortableField,
} from '../../domain/repositories/team.repository';
import type { Team } from '../../domain/entities/team.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './team.persistence-mapper';

@Injectable()
export class DrizzleTeamRepository implements TeamRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<Team | null> {
    if (!isUuid(id)) return this.findBySlug(id, context);
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySlug(slug: string, context?: TransactionContext): Promise<Team | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByName(name: string, context?: TransactionContext): Promise<Team | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select()
      .from(teams)
      .where(and(sql`lower(btrim(${teams.name})) = lower(btrim(${name}))`, isNull(teams.deletedAt)))
      .limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Team | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(teams).where(eq(teams.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async search(
    filters: TeamFilters,
    page: PageRequest,
    sort: SortRequest<TeamSortableField>,
    context?: TransactionContext,
  ): Promise<Page<TeamListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    const memberCountSubquery = db
      .select({ teamId: teamMembers.teamId, value: count().as('member_count') })
      .from(teamMembers)
      .where(isNull(teamMembers.leftAt))
      .groupBy(teamMembers.teamId)
      .as('member_counts');

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: teams.id,
          name: teams.name,
          slug: teams.slug,
          description: teams.description,
          isActive: teams.isActive,
          leaderUserId: teams.leaderUserId,
          leaderFirstName: users.firstName,
          leaderLastName: users.lastName,
          teamTypeId: teams.teamTypeId,
          teamTypeName: teamTypes.name,
          teamTypeColor: teamTypes.color,
          teamTypeIcon: teamTypes.icon,
          memberCount: sql<number>`coalesce(${memberCountSubquery.value}, 0)`,
          createdAt: teams.createdAt,
        })
        .from(teams)
        .leftJoin(users, eq(users.id, teams.leaderUserId))
        .leftJoin(teamTypes, eq(teamTypes.id, teams.teamTypeId))
        .leftJoin(memberCountSubquery, eq(memberCountSubquery.teamId, teams.id))
        .where(where)
        .orderBy(
          ...(sort.field === 'memberCount'
            ? [
                (sort.direction === 'desc' ? desc : asc)(
                  sql`coalesce(${memberCountSubquery.value}, 0)`,
                ),
                asc(teams.id),
              ]
            : this.buildOrderBy(sort)),
        )
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db.select({ value: count() }).from(teams).where(where),
    ]);

    const items: TeamListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.isActive,
      leaderUserId: row.leaderUserId,
      leaderName: row.leaderFirstName ? `${row.leaderFirstName} ${row.leaderLastName ?? ''}`.trim() : null,
      teamTypeId: row.teamTypeId,
      teamTypeName: row.teamTypeName,
      teamTypeColor: row.teamTypeColor,
      teamTypeIcon: row.teamTypeIcon,
      memberCount: Number(row.memberCount),
      createdAt: row.createdAt,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async save(team: Team, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(team);

    await db
      .insert(teams)
      .values({ id: team.id, ...values })
      .onConflictDoUpdate({ target: teams.id, set: values });
  }

  async nameIsTakenByAnother(
    name: string,
    excludingTeamId: string | null,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const conditions = [
      sql`lower(btrim(${teams.name})) = lower(btrim(${name}))`,
      isNull(teams.deletedAt),
    ];
    if (excludingTeamId) conditions.push(ne(teams.id, excludingTeamId));

    const rows = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0;
  }

  async countActiveMembers(teamId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ value: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)));
    return rows[0]?.value ?? 0;
  }

  async isTeamLeaderOfMember(leaderUserId: string, memberUserId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.userId, memberUserId), isNull(teamMembers.leftAt), this.leadsTeamCondition(leaderUserId)))
      .limit(1);
    return rows.length > 0;
  }

  async findMemberUserIdsForLeader(leaderUserId: string, context?: TransactionContext): Promise<string[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .selectDistinct({ userId: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(isNull(teamMembers.leftAt), this.leadsTeamCondition(leaderUserId)));
    return rows.map((row) => row.userId);
  }

  async isLeaderOfTeam(userId: string, teamId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(isUuid(teamId) ? eq(teams.id, teamId) : eq(teams.slug, teamId), eq(teams.leaderUserId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async leadsTeam(userId: string, teamId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, teamId), this.leadsTeamCondition(userId)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * ¿`userId` lidera este equipo? — o bien es su líder oficial
   * (`teams.leaderUserId`), o lidera al menos un proyecto asignado a este
   * equipo (`project_teams.leaderUserId`, migrado de `equipo_proyecto` en la
   * v1) sin ser el líder registrado del equipo. La v1 permitía ambos casos.
   */
  private leadsTeamCondition(userId: string) {
    return or(
      eq(teams.leaderUserId, userId),
      sql`exists (
        select 1 from ${projectTeams}
        where ${projectTeams.teamId} = ${teams.id}
          and ${projectTeams.leaderUserId} = ${userId}
      )`,
    );
  }

  async findActiveTeamForUser(
    userId: string,
    context?: TransactionContext,
  ): Promise<{ id: string; name: string } | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getHoursByMemberAndDate(
    teamId: string,
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<Array<{ teamMemberId: string; date: string; approvedHours: number; pendingHours: number }>> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        teamMemberId: teamMembers.id,
        date: hourEntries.date,
        approvedHours: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'approved'), 0)`,
        pendingHours: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'pending'), 0)`,
      })
      .from(teamMembers)
      .innerJoin(
        hourEntries,
        and(
          eq(hourEntries.userId, teamMembers.userId),
          inArray(hourEntries.status, ['approved', 'pending']),
          gte(hourEntries.date, dateFrom),
          lte(hourEntries.date, dateTo),
        ),
      )
      .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)))
      .groupBy(teamMembers.id, hourEntries.date);

    return rows.map((row) => ({
      teamMemberId: row.teamMemberId,
      date: row.date.toISOString().slice(0, 10),
      approvedHours: Number(row.approvedHours),
      pendingHours: Number(row.pendingHours),
    }));
  }

  private buildWhere(filters: TeamFilters) {
    const conditions = [];
    if (!filters.includeDeleted) conditions.push(isNull(teams.deletedAt));
    if (filters.isActive !== undefined) conditions.push(eq(teams.isActive, filters.isActive));
    if (filters.search) conditions.push(ilike(teams.name, `%${filters.search.trim()}%`));
    if (filters.leaderUserId) conditions.push(this.leadsTeamCondition(filters.leaderUserId));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /** `memberCount` se resuelve aparte, junto a la subconsulta que lo calcula. */
  private buildOrderBy(sort: SortRequest<TeamSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;
    const column = sort.field === 'name' ? teams.name : teams.createdAt;
    return [direction(column), asc(teams.id)];
  }
}
