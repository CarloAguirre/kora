import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ForbiddenError, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type {
  Permission,
  RequestTeamReportDataResponse,
  TeamReportDataRequestData,
  TeamReportMissingField,
} from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import { TEAM_REPORT_READER, type TeamReportProjectRow, type TeamReportReader } from '../ports/team-report-reader.port';
import { TEAM_USER_READER, type TeamUserReader } from '../ports/team-user-reader.port';
import { NOTIFICATION_INBOX, type NotificationInbox } from '../../../notifications/application/ports/notification-inbox.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface RequestTeamReportDataCommand {
  readonly teamId: string;
  readonly projectIds: readonly string[];
  readonly note: string | undefined;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Mismo criterio que el aviso del reporte: "sin HH asignadas" solo cuenta si el equipo ya incurrió horas en el proyecto. */
function missingFields(project: TeamReportProjectRow, hasTeamHours: boolean): TeamReportMissingField[] {
  const missing: TeamReportMissingField[] = [];
  if (!project.assignedHours && hasTeamHours) missing.push('assigned_hours');
  if (!project.startDate || !project.endDate) missing.push('dates');
  return missing;
}

/**
 * "Pedir datos a los Líderes PM" del Reporte de equipo. Las fechas y las HH
 * asignadas al equipo las carga el Líder PM de cada proyecto: cada uno recibe UNA
 * notificación en Kora con la lista de sus proyectos (y el correo de respaldo a
 * las 48 h si no la abre — `SendOverdueNotificationEmailsUseCase`).
 *
 * Lo faltante se recalcula aquí con los datos actuales, no se confía en lo que
 * mandó el cliente: un proyecto que ya se completó, o sin Líder PM, se omite.
 */
@Injectable()
export class RequestTeamReportDataUseCase
  implements UseCase<RequestTeamReportDataCommand, RequestTeamReportDataResponse, ApplicationError>
{
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_REPORT_READER) private readonly reports: TeamReportReader,
    @Inject(TEAM_USER_READER) private readonly users: TeamUserReader,
    @Inject(NOTIFICATION_INBOX) private readonly inbox: NotificationInbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RequestTeamReportDataCommand): Promise<Result<RequestTeamReportDataResponse, ApplicationError>> {
    const { teamId, projectIds, note, actor, actorPermissions } = command;
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    if (!actorPermissions.includes('projects:manage') && !(await this.teams.isLeaderOfTeam(actor.userId, team.id))) {
      return err(new ForbiddenError('Solo el líder del equipo puede pedir datos de su reporte.'));
    }

    const requested = new Set(projectIds);
    const now = this.clock.now();
    const candidates = (await this.reports.listProjects(team.id)).filter(
      (project) => requested.has(project.projectId) && project.projectLeader,
    );
    const people = await this.reports.listPeople(team.id, team.leaderUserId);
    const hours = await this.reports.sumHours(
      candidates.map((project) => project.projectId),
      people.map((person) => person.id),
      now,
      now,
    );
    const withTeamHours = new Set(
      hours.filter((row) => row.accumulatedApproved + row.accumulatedPending > 0).map((row) => row.projectId),
    );

    const byLeader = new Map<string, { project: TeamReportProjectRow; missing: TeamReportMissingField[] }[]>();
    for (const project of candidates) {
      const missing = missingFields(project, withTeamHours.has(project.projectId));
      if (!project.projectLeader || missing.length === 0) continue;
      const list = byLeader.get(project.projectLeader.id) ?? [];
      list.push({ project, missing });
      byLeader.set(project.projectLeader.id, list);
    }

    const requester = await this.users.findById(actor.userId);
    const requestedBy = { id: actor.userId, fullName: requester?.fullName ?? actor.email };
    for (const [leaderId, items] of byLeader) {
      const data: TeamReportDataRequestData = {
        teamId: team.id,
        teamName: team.name,
        requestedBy,
        note: note || null,
        items: items.map(({ project, missing }) => ({
          projectId: project.projectId,
          projectSlug: project.slug,
          projectName: project.name,
          clientName: project.client?.companyName ?? null,
          missing,
        })),
      };
      await this.inbox.create({
        userId: leaderId,
        type: 'team_report_data_request',
        title: `${requestedBy.fullName} (${team.name}) te pide completar datos de ${items.length} proyecto${items.length === 1 ? '' : 's'}`,
        data,
        createdByUserId: actor.userId,
      });
    }

    const requestedProjectIds = [...byLeader.values()].flat().map(({ project }) => project.projectId);
    await this.reports.markDataRequested(team.id, requestedProjectIds, now);
    return ok({ notifiedLeaders: byLeader.size, requestedProjects: requestedProjectIds.length });
  }
}
