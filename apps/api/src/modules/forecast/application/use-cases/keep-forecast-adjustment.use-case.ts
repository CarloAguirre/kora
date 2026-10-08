import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { isAdminTier, type RoleCode } from '@kora/contracts';
import {
  ForbiddenForecastAccessError,
  ForecastAssignmentNotFoundError,
  ReferencedTeamMemberNotFoundError,
} from '../../domain/errors/forecast.errors';
import { FORECAST_ASSIGNMENT_REPOSITORY, type ForecastAssignmentRepository } from '../../domain/repositories/forecast-assignment.repository';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import { ForecastAssignmentHistory } from '../services/forecast-assignment-history';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface KeepForecastAdjustmentCommand {
  readonly assignmentId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/** "Mantener mi ajuste" sobre una fila desfasada: el líder vio el nuevo cálculo y conserva su valor. */
@Injectable()
export class KeepForecastAdjustmentUseCase implements UseCase<KeepForecastAdjustmentCommand, void, ApplicationError> {
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    private readonly history: ForecastAssignmentHistory,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: KeepForecastAdjustmentCommand): Promise<Result<void, ApplicationError>> {
    const { assignmentId, actor, actorRole } = command;

    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) return err(new ForecastAssignmentNotFoundError(assignmentId));

    const member = await this.teams.findMemberById(assignment.teamMemberId);
    if (!member) return err(new ReferencedTeamMemberNotFoundError(assignment.teamMemberId));
    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(member.teamId, actor.userId))) {
      return err(new ForbiddenForecastAccessError());
    }
    if (!assignment.isStale) return ok(undefined);

    assignment.keepAdjustment(this.clock.now());
    await this.assignments.save(assignment);
    await this.history.record(
      'update',
      assignment,
      member,
      actor,
      `Mantuvo su ajuste (el cálculo da ${assignment.calculatedHours ?? 0} HH).`,
    );
    return ok(undefined);
  }
}
