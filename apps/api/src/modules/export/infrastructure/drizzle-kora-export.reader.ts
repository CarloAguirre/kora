import { Inject, Injectable } from '@nestjs/common';
import {
  clients,
  eq,
  isNull,
  lte,
  projectModules,
  projectObservations,
  projects,
  projectTeamMembers,
  projectTeams,
  sql,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import type {
  ExportProjectUpdateRow,
  KoraExportReader,
  KoraExportRows,
} from '../application/ports/kora-export-reader.port';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';

const toNumber = (value: string | null): number | null => (value === null ? null : Number(value));

@Injectable()
export class DrizzleKoraExportReader implements KoraExportReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async readAll(updatesLimit: number): Promise<KoraExportRows> {
    const [people, clientRows, projectRows, projectTeamRows, collaboratorRows, updates] = await Promise.all([
      this.database
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users),
      this.database
        .select({
          id: clients.id,
          companyName: clients.companyName,
          legalName: clients.legalName,
          taxId: clients.taxId,
          slug: clients.slug,
          status: clients.status,
          website: clients.website,
          commercialManagerUserId: clients.commercialManagerUserId,
        })
        .from(clients)
        .where(isNull(clients.deletedAt)),
      this.database
        .select({
          id: projects.id,
          clientId: projects.clientId,
          name: projects.name,
          slug: projects.slug,
          type: projects.type,
          status: projects.status,
          phase: projects.phase,
          salesStage: projects.salesStage,
          priority: projects.priority,
          isInternal: projects.isInternal,
          startDate: projects.startDate,
          endDate: projects.endDate,
          estimatedDeliveryDate: projects.estimatedDeliveryDate,
          soldHours: projects.soldHours,
          usedHours: projects.usedHours,
          expectedProgress: projects.expectedProgress,
          actualProgress: projects.actualProgress,
          leaderUserId: projects.leaderUserId,
          commercialManagerUserId: projects.commercialManagerUserId,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(isNull(projects.deletedAt)),
      this.database
        .select({
          projectId: projectTeams.projectId,
          teamId: projectTeams.teamId,
          teamName: teams.name,
          leaderUserId: projectTeams.leaderUserId,
          assignedHours: projectTeams.assignedHours,
        })
        .from(projectTeams)
        .innerJoin(teams, eq(teams.id, projectTeams.teamId)),
      this.database
        .select({
          projectId: projectTeamMembers.projectId,
          teamId: projectTeamMembers.teamId,
          teamName: teams.name,
          userId: teamMembers.userId,
          position: teamMembers.position,
          activity: projectTeamMembers.activity,
          assignedHours: projectTeamMembers.assignedHours,
          consumedHours: projectTeamMembers.consumedHours,
          blockedAt: projectTeamMembers.blockedAt,
        })
        .from(projectTeamMembers)
        .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
        .innerJoin(teams, eq(teams.id, projectTeamMembers.teamId)),
      this.readLatestUpdates(updatesLimit),
    ]);

    return {
      people: people.map((row) => ({
        id: row.id,
        fullName: `${row.firstName} ${row.lastName}`.trim(),
        email: row.email,
      })),
      clients: clientRows,
      projects: projectRows.map((row) => ({
        ...row,
        soldHours: Number(row.soldHours),
        usedHours: Number(row.usedHours),
      })),
      projectTeams: projectTeamRows.map((row) => ({ ...row, assignedHours: toNumber(row.assignedHours) })),
      collaborators: collaboratorRows.map((row) => ({
        ...row,
        assignedHours: Number(row.assignedHours),
        consumedHours: Number(row.consumedHours),
      })),
      updates,
    };
  }

  /** Las N entradas de bitácora más recientes de cada proyecto, en una sola consulta (row_number por proyecto). */
  private async readLatestUpdates(limit: number): Promise<ExportProjectUpdateRow[]> {
    if (limit <= 0) return [];

    const ranked = this.database
      .select({
        id: projectObservations.id,
        projectId: projectObservations.projectId,
        type: projectObservations.type,
        title: projectObservations.title,
        message: projectObservations.message,
        status: projectObservations.status,
        moduleName: projectModules.name,
        date: projectObservations.date,
        createdAt: projectObservations.createdAt,
        authorUserId: projectObservations.authorUserId,
        rank: sql<number>`row_number() over (
          partition by ${projectObservations.projectId}
          order by ${projectObservations.date} desc, ${projectObservations.createdAt} desc
        )`.as('rank'),
      })
      .from(projectObservations)
      .leftJoin(projectModules, eq(projectModules.id, projectObservations.moduleId))
      .as('ranked');

    const rows = await this.database
      .select({
        id: ranked.id,
        projectId: ranked.projectId,
        type: ranked.type,
        title: ranked.title,
        message: ranked.message,
        status: ranked.status,
        moduleName: ranked.moduleName,
        date: ranked.date,
        createdAt: ranked.createdAt,
        authorUserId: ranked.authorUserId,
      })
      .from(ranked)
      .where(lte(ranked.rank, limit))
      .orderBy(ranked.projectId, ranked.rank);

    return rows;
  }
}
