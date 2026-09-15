import { Inject, Injectable } from '@nestjs/common';
import { and, eq, projectTeamMembers, projectTeams, sql, teams, users, type Database } from '@kora/db';
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
    const rows = await db
      .select({
        id: projectTeams.id,
        teamId: projectTeams.teamId,
        teamName: teams.name,
        leaderUserId: projectTeams.leaderUserId,
        leaderFirstName: users.firstName,
        leaderLastName: users.lastName,
        assignedHours: projectTeams.assignedHours,
        memberCount: sql<string>`count(${projectTeamMembers.id})`,
      })
      .from(projectTeams)
      .innerJoin(teams, eq(teams.id, projectTeams.teamId))
      .leftJoin(users, eq(users.id, projectTeams.leaderUserId))
      .leftJoin(
        projectTeamMembers,
        and(
          eq(projectTeamMembers.projectId, projectTeams.projectId),
          eq(projectTeamMembers.teamId, projectTeams.teamId),
        ),
      )
      .where(eq(projectTeams.projectId, projectId))
      .groupBy(projectTeams.id, teams.name, users.firstName, users.lastName);

    return rows.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      teamName: row.teamName,
      leaderUserId: row.leaderUserId,
      leaderName: row.leaderUserId ? `${row.leaderFirstName ?? ''} ${row.leaderLastName ?? ''}`.trim() : null,
      assignedHours: row.assignedHours !== null ? Number(row.assignedHours) : null,
      memberCount: Number(row.memberCount),
    }));
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
      .leftJoin(projectTeams, and(eq(projectTeams.teamId, teams.id), eq(projectTeams.projectId, projectId)))
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
