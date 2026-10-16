import { Inject, Injectable } from '@nestjs/common';
import { err, ForbiddenError, NotFoundError, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission } from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import { TEAM_REPORT_READER, type TeamReportReader } from '../ports/team-report-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateTeamReportCommentCommand {
  readonly teamId: string;
  readonly projectId: string;
  readonly comment: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Comentario del "Reporte de equipo" — lo escribe el líder oficial del equipo (o quien gestiona proyectos). */
@Injectable()
export class UpdateTeamReportCommentUseCase implements UseCase<UpdateTeamReportCommentCommand, void, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_REPORT_READER) private readonly reports: TeamReportReader,
  ) {}

  async execute(command: UpdateTeamReportCommentCommand): Promise<Result<void, ApplicationError>> {
    const { teamId, projectId, comment, actor, actorPermissions } = command;
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    if (!actorPermissions.includes('projects:manage') && !(await this.teams.isLeaderOfTeam(actor.userId, team.id))) {
      return err(new ForbiddenError('Solo el líder del equipo puede comentar su reporte.'));
    }

    const updated = await this.reports.updateComment(team.id, projectId, comment === '' ? null : comment);
    if (!updated) return err(new NotFoundError('Proyecto del equipo', projectId, 'TEAM_PROJECT_NOT_FOUND'));
    return ok(undefined);
  }
}
