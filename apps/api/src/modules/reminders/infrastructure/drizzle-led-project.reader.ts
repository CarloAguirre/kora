import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { clients, hourEntries, projects, projectTeams, teamMembers, teams, type Database } from '@kora/db';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';
import type { LedProjectReader, LedProjectTeamRow } from '../application/ports/led-project-reader.port';

const toIsoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

@Injectable()
export class DrizzleLedProjectReader implements LedProjectReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listTeamsOfLedProjects(userId: string): Promise<LedProjectTeamRow[]> {
    const rows = await this.db
      .select({
        projectId: projects.id,
        projectSlug: projects.slug,
        projectName: projects.name,
        clientName: clients.companyName,
        salesStage: projects.salesStage,
        startDate: projects.startDate,
        endDate: projects.endDate,
        teamName: teams.name,
        assignedHours: projectTeams.assignedHours,
        // Mismas personas que `DrizzleTeamReportReader.listPeople` (miembros activos + líder oficial del equipo).
        teamHasHours: sql<boolean>`exists (
          select 1 from ${hourEntries}
          where ${hourEntries.projectId} = ${projects.id}
            and ${hourEntries.status} <> 'rejected'
            and (
              ${hourEntries.userId} = ${teams.leaderUserId}
              or exists (
                select 1 from ${teamMembers}
                where ${teamMembers.teamId} = ${teams.id}
                  and ${teamMembers.userId} = ${hourEntries.userId}
                  and ${teamMembers.leftAt} is null
              )
            )
        )`,
      })
      .from(projects)
      .innerJoin(projectTeams, eq(projectTeams.projectId, projects.id))
      .innerJoin(teams, and(eq(teams.id, projectTeams.teamId), isNull(teams.deletedAt)))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(eq(projects.leaderUserId, userId), isNull(projects.deletedAt), notInArray(projects.status, ['cancelled', 'finished'])),
      )
      .orderBy(sql`${clients.companyName} asc nulls last`, asc(projects.name), asc(teams.name));

    return rows.map((row) => ({
      ...row,
      startDate: toIsoDate(row.startDate),
      endDate: toIsoDate(row.endDate),
      assignedHours: row.assignedHours === null ? null : Number(row.assignedHours),
    }));
  }
}
