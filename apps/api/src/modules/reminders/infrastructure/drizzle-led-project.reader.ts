import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import {
  clients, hourEntries, projectQuotations, projectTeamMembers, projectTeams,
  projects, quotationEvents, quotationVersions, teamMembers, teams, users,
  type Database,
} from '@kora/db';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';
import type {
  LedProjectReader, LedProjectTeamRow, TeamAwaitingStaffingRow,
} from '../application/ports/led-project-reader.port';

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
  /**
   * Pendiente operativo por equipo y proyecto. No se escribe una notificación
   * cada vez que se consulta: la campanita muestra el pendiente mientras
   * exista un traspaso válido y no haya colaboradores activos, y lo oculta
   * al completar la dotación definida por el PM (o agregar una persona si no hay cupos).
   *
   * Se usa líder efectivo (override del proyecto o líder orgánico del equipo)
   * y se comprueba un evento real quotation_transferred, no salesStage editable.
   */
  async listTeamsAwaitingStaffing(userId: string): Promise<TeamAwaitingStaffingRow[]> {
    return this.db.select({
      projectId: projects.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      clientName: clients.companyName,
      teamId: teams.id,
      teamSlug: teams.slug,
      teamName: teams.name,
    })
      .from(projectTeams)
      .innerJoin(projects, eq(projects.id, projectTeams.projectId))
      .innerJoin(teams, and(eq(teams.id, projectTeams.teamId), isNull(teams.deletedAt)))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(and(
        sql`coalesce(${projectTeams.leaderUserId}, ${teams.leaderUserId}) = ${userId}`,
        isNull(projects.deletedAt),
        eq(teams.isActive, true),
        eq(projects.type, 'development'),
        notInArray(projects.status, ['cancelled', 'finished']),
        sql`coalesce(${projectTeams.assignedHours}, 0) > 0`,
        sql`exists (
          select 1 from ${projectQuotations}
          join ${quotationVersions}
            on ${quotationVersions.quotationId} = ${projectQuotations.id}
          join ${quotationEvents}
            on ${quotationEvents.versionId} = ${quotationVersions.id}
          where ${projectQuotations.projectId} = ${projects.id}
            and ${quotationEvents.action} = 'quotation_transferred'
        )`,
        // Si el PM definió N colaboradores, el pendiente permanece mientras
        // haya menos de N activos; sin cupos definidos basta incorporar uno.
        sql`(
          select count(distinct ${teamMembers.userId}) from ${projectTeamMembers}
          join ${teamMembers} on ${teamMembers.id} = ${projectTeamMembers.teamMemberId}
          join ${users} on ${users.id} = ${teamMembers.userId}
          where ${projectTeamMembers.projectId} = ${projectTeams.projectId}
            and ${projectTeamMembers.teamId} = ${projectTeams.teamId}
            and ${projectTeamMembers.blockedAt} is null
            and ${teamMembers.leftAt} is null
            and ${users.status} = 'active'
        ) < coalesce(nullif(${projectTeams.memberCount}, 0), 1)`,
      ))
      .orderBy(asc(projects.name), asc(teams.name));
  }

}
