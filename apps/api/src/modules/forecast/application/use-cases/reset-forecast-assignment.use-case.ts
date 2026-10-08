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

export interface ResetForecastAssignmentCommand {
  readonly assignmentId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * "Volver al cálculo" (o "Usar el nuevo cálculo" en una fila desfasada): las HH vuelven a seguir al
 * proyecto. Si el cálculo ya no produce esa semana (0 HH), la fila se elimina, igual que haría la
 * sincronización con una fila sin ajuste.
 */
@Injectable()
export class ResetForecastAssignmentUseCase implements UseCase<ResetForecastAssignmentCommand, void, ApplicationError> {
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    private readonly history: ForecastAssignmentHistory,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResetForecastAssignmentCommand): Promise<Result<void, ApplicationError>> {
    const { assignmentId, actor, actorRole } = command;

    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) return err(new ForecastAssignmentNotFoundError(assignmentId));

    const member = await this.teams.findMemberById(assignment.teamMemberId);
    if (!member) return err(new ReferencedTeamMemberNotFoundError(assignment.teamMemberId));
    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(member.teamId, actor.userId))) {
      return err(new ForbiddenForecastAccessError());
    }

    const reset = assignment.resetToCalculation(this.clock.now());
    if (reset.isErr()) return err(reset.error);

    if (assignment.assignedHours === 0) {
      await this.assignments.delete(assignment.id);
      await this.history.record('delete', assignment, member, actor, 'Volvió al cálculo: esta semana ya no tiene HH calculadas.');
    } else {
      await this.assignments.save(assignment);
      await this.history.record('update', assignment, member, actor, 'Volvió al cálculo.');
    }
    return ok(undefined);
  }
}
