import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  hourEntries,
  projectTeamMembers,
  projectTeams,
  sql,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ProjectTeamRecord,
  ProjectTeamRepository,
  UpsertProjectTeamInput,
} from '../../domain/repositories/project-team.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleProjectTeamRepository implements ProjectTeamRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async save(input: UpsertProjectTeamInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = {
      projectId: input.projectId,
      teamId: input.teamId,
      leaderUserId: input.leaderUserId,
      memberCount: input.memberCount,
      assignedHours: input.assignedHours != null ? String(input.assignedHours) : null,
    };

    await db
      .insert(projectTeams)
      .values(values)
      .onConflictDoUpdate({ target: [projectTeams.projectId, projectTeams.teamId], set: values });
  }

  async remove(projectId: string, teamId: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db
      .delete(projectTeams)
      .where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, teamId)));
  }

  async findByProject(projectId: string, context?: TransactionContext): Promise<ProjectTeamRecord[]> {
    const db = resolveDb(this.database, context);
    const effectiveLeaderUserId = sql<string | null>`coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId})`;
    const rows = await db
      .select({
        id: projectTeams.id,
        teamId: projectTeams.teamId,
        teamSlug: teams.slug,
        teamName: teams.name,
        leaderUserId: sql<string | null>`coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId})`,
        leaderFirstName: users.firstName,
        leaderLastName: users.lastName,
        assignedHours: projectTeams.assignedHours,
        memberCount: sql<string>`count(${projectTeamMembers.id})`,
        maxMembers: projectTeams.memberCount,
        createdAt: projectTeams.createdAt,
        effectiveLeaderUserId,
        // Mismo criterio que `consumedHours` de `DrizzleProjectTeamMemberRepository`: en vivo desde las aprobadas.
        leaderApprovedHours: sql<string>`coalesce((
          select sum(${hourEntries.hours}) from ${hourEntries}
          where ${hourEntries.projectId} = ${projectTeams.projectId}
            and ${hourEntries.userId} = ${effectiveLeaderUserId}
            and ${hourEntries.status} = 'approved'
        ), 0)`,
      })
      .from(projectTeams)
      .innerJoin(teams, eq(teams.id, projectTeams.teamId))
      .leftJoin(users, sql`${users.id} = coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId})`)
      .leftJoin(
        projectTeamMembers,
        and(
          eq(projectTeamMembers.projectId, projectTeams.projectId),
          eq(projectTeamMembers.teamId, projectTeams.teamId),
          sql`${projectTeamMembers.blockedAt} is null`,
        ),
      )
      .where(eq(projectTeams.projectId, projectId))
      .groupBy(projectTeams.id, teams.id, teams.slug, teams.name, teams.leaderUserId, users.firstName, users.lastName)
      .orderBy(projectTeams.createdAt, projectTeams.id);

    const assignedUserIds = new Set(
      (
        await db
          .select({ userId: teamMembers.userId })
          .from(projectTeamMembers)
          .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
          .where(eq(projectTeamMembers.projectId, projectId))
      ).map((row) => row.userId),
    );
    // Un líder que no es miembro se cuenta una sola vez: en el primer equipo que lidera (orden de asignación).
    const creditedLeaderIds = new Set<string>();

    return rows.map((row) => {
      const leaderId = row.effectiveLeaderUserId;
      const credits = leaderId !== null && !assignedUserIds.has(leaderId) && !creditedLeaderIds.has(leaderId);
      if (credits) creditedLeaderIds.add(leaderId);
      return {
        id: row.id,
        teamId: row.teamId,
        teamSlug: row.teamSlug,
        teamName: row.teamName,
        leaderUserId: row.leaderUserId,
        leaderName: row.leaderUserId ? `${row.leaderFirstName ?? ''} ${row.leaderLastName ?? ''}`.trim() : null,
        assignedHours: row.assignedHours !== null ? Number(row.assignedHours) : null,
        memberCount: Number(row.memberCount),
        maxMembers: row.maxMembers,
        leaderConsumedHours: credits ? Number(row.leaderApprovedHours) : 0,
      };
    });
  }

  async isTeamLeaderForProject(
    projectId: string,
    teamId: string,
    actorUserId: string,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(projectTeams, and(eq(projectTeams.teamId, teams.id), eq(projectTeams.projectId, projectId)))
      .where(
        and(
          eq(teams.id, teamId),
          sql`coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId}) = ${actorUserId}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
