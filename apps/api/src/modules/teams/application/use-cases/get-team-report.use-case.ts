import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ForbiddenError, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, TeamReportMemberHours, TeamReportResponse } from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import { TEAM_REPORT_READER, type TeamReportReader } from '../ports/team-report-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

/** Ventana móvil de actividad para el listado, independiente del período usado para calcular HH. */
const RECENT_ACTIVITY_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    @Inject(CLOCK) private readonly clock: Clock,
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
    // El vínculo histórico en project_teams no implica participación vigente.
    // Primero seleccionar proyectos donde alguien del equipo CARGÓ horas dentro
    // de los últimos 10 días, independientemente de la fecha trabajada o de los
    // controles de período del reporte.
    const now = this.clock.now();
    const recentlyActiveIds = await this.reports.findProjectsWithRecentHourEntries(
      projects.map((project) => project.projectId),
      members.map((member) => member.id),
      new Date(now.getTime() - RECENT_ACTIVITY_DAYS * DAY_MS),
      now,
    );
    const activeProjects = projects.filter((project) => recentlyActiveIds.has(project.projectId));
    const projectIds = activeProjects.map((project) => project.projectId);
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
      projects: activeProjects.map((project) => ({
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
