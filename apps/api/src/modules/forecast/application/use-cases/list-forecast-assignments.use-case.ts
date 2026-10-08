import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { isAdminTier, type ForecastAssignment, type RoleCode } from '@kora/contracts';
import { ForbiddenForecastAccessError } from '../../domain/errors/forecast.errors';
import {
  FORECAST_ASSIGNMENT_REPOSITORY,
  type ForecastAssignmentRecord,
  type ForecastAssignmentRepository,
} from '../../domain/repositories/forecast-assignment.repository';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListForecastAssignmentsCommand {
  readonly teamId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly actorUserId: string;
  readonly actorRole: RoleCode;
}

@Injectable()
export class ListForecastAssignmentsUseCase
  implements UseCase<ListForecastAssignmentsCommand, ForecastAssignment[], ApplicationError>
{
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
  ) {}

  async execute(command: ListForecastAssignmentsCommand): Promise<Result<ForecastAssignment[], ApplicationError>> {
    const { teamId, periodStart, periodEnd, actorUserId, actorRole } = command;

    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(teamId, actorUserId))) {
      return err(new ForbiddenForecastAccessError());
    }

    const records = await this.assignments.listForTeamAndPeriod(teamId, periodStart, periodEnd);
    return ok(records.map(toContract));
  }
}

export function toContract(record: ForecastAssignmentRecord): ForecastAssignment {
  return {
    id: record.id,
    teamMemberId: record.teamMemberId,
    memberFullName: record.memberFullName,
    teamId: record.teamId,
    teamName: record.teamName,
    periodStart: record.periodStart.toISOString().slice(0, 10),
    periodEnd: record.periodEnd.toISOString().slice(0, 10),
    type: record.type as ForecastAssignment['type'],
    project: record.projectId ? { id: record.projectId, name: record.projectName ?? '' } : null,
    client: record.clientId ? { id: record.clientId, companyName: record.clientName ?? '' } : null,
    comments: record.comments,
    assignedHours: record.assignedHours,
    source: record.source,
    segment: record.segmentId
      ? { id: record.segmentId, name: record.segmentName ?? '', moduleName: record.segmentModuleName ?? '' }
      : null,
    task: record.taskId ? { id: record.taskId, name: record.taskName ?? '', moduleName: record.taskModuleName ?? '' } : null,
    calculatedHours: record.calculatedHours,
    adjusted: record.adjustedAt ? { at: record.adjustedAt.toISOString(), byName: record.adjustedByName } : null,
    isStale: record.isStale,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
