import { Inject, Injectable } from '@nestjs/common';
import { err, ForbiddenError, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission, TeamReportMemberHours, TeamReportResponse } from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import { TEAM_REPORT_READER, type TeamReportReader } from '../ports/team-report-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface GetTeamReportCommand {
  readonly teamId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * "Reporte de equipo" de `/equipos`. Lo ve quien tiene `projects:read` (alcance completo) o
 * el líder OFICIAL del equipo — mismo criterio que la vista "Proyectos del equipo" de
 * `ListProjectsUseCase`, a la que reemplaza.
 */
@Injectable()
export class GetTeamReportUseCase implements UseCase<GetTeamReportCommand, TeamReportResponse, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_REPORT_READER) private readonly reports: TeamReportReader,
  ) {}

  async execute(command: GetTeamReportCommand): Promise<Result<TeamReportResponse, ApplicationError>> {
    const { teamId, dateFrom, dateTo, actor, actorPermissions } = command;
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    if (!actorPermissions.includes('projects:read') && !(await this.teams.isLeaderOfTeam(actor.userId, team.id))) {
      return err(new ForbiddenError('Solo el líder del equipo puede ver su reporte.'));
    }

    const [members, projects] = await Promise.all([
      this.reports.listPeople(team.id, team.leaderUserId),
      this.reports.listProjects(team.id),
    ]);
    const projectIds = projects.map((project) => project.projectId);
    const [hours, tasks, approvedDeliveries] = await Promise.all([
      this.reports.sumHours(
        projectIds,
        members.map((member) => member.id),
        new Date(`${dateFrom}T00:00:00.000Z`),
        new Date(`${dateTo}T00:00:00.000Z`),
      ),
      this.reports.listTeamTasks(team.id, projectIds),
      this.reports.listProjectsWithApprovedDelivery(team.id, projectIds),
    ]);

    const hoursByProject = new Map<string, TeamReportMemberHours[]>();
    for (const { projectId, ...row } of hours) {
      const list = hoursByProject.get(projectId) ?? [];
      list.push(row);
      hoursByProject.set(projectId, list);
    }
    const tasksByProject = new Map(tasks.map((row) => [row.projectId, row]));

    return ok({
      teamId: team.id,
      teamName: team.name,
      dateFrom,
      dateTo,
      members: [...members],
      projects: projects.map((project) => ({
        ...project,
        hours: hoursByProject.get(project.projectId) ?? [],
        teamTasks: {
          total: tasksByProject.get(project.projectId)?.total ?? 0,
          approved: tasksByProject.get(project.projectId)?.approved ?? 0,
        },
        teamDeliveryApproved: approvedDeliveries.has(project.projectId),
      })),
    });
  }
}
