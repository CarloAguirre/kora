import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { isAdminTier, type RoleCode } from '@kora/contracts';
import {
  ForbiddenForecastAccessError,
  ForecastAssignmentNotFoundError,
  ForecastCalculatedRowNotDeletableError,
} from '../../domain/errors/forecast.errors';
import { FORECAST_ASSIGNMENT_REPOSITORY, type ForecastAssignmentRepository } from '../../domain/repositories/forecast-assignment.repository';
import { FORECAST_CLIENT_READER, type ForecastClientReader } from '../ports/forecast-client-reader.port';
import { FORECAST_PROJECT_READER, type ForecastProjectReader } from '../ports/forecast-project-reader.port';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteForecastAssignmentCommand {
  readonly assignmentId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class DeleteForecastAssignmentUseCase implements UseCase<DeleteForecastAssignmentCommand, void, ApplicationError> {
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    @Inject(FORECAST_PROJECT_READER) private readonly projects: ForecastProjectReader,
    @Inject(FORECAST_CLIENT_READER) private readonly clients: ForecastClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: DeleteForecastAssignmentCommand): Promise<Result<void, ApplicationError>> {
    const { assignmentId, actor, actorRole } = command;

    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) return err(new ForecastAssignmentNotFoundError(assignmentId));

    const member = await this.teams.findMemberById(assignment.teamMemberId);

    if (member && !isAdminTier(actorRole) && !(await this.teams.isTeamLeader(member.teamId, actor.userId))) {
      return err(new ForbiddenForecastAccessError());
    }
    if (!member && !isAdminTier(actorRole)) {
      return err(new ForbiddenForecastAccessError());
    }

    if (assignment.isCalculated) return err(new ForecastCalculatedRowNotDeletableError());

    const [project, client] = await Promise.all([
      assignment.projectId ? this.projects.findById(assignment.projectId) : Promise.resolve(null),
      assignment.clientId ? this.clients.findById(assignment.clientId) : Promise.resolve(null),
    ]);

    await this.assignments.delete(assignmentId);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'delete',
      entityType: 'forecast_assignment',
      entityId: assignment.id,
      metadata: {
        teamId: member?.teamId ?? null,
        teamName: member?.teamName ?? null,
        periodStart: assignment.periodStart.toISOString().slice(0, 10),
        periodEnd: assignment.periodEnd.toISOString().slice(0, 10),
        memberFullName: member?.fullName ?? null,
        type: assignment.type,
        projectName: project?.name ?? null,
        clientName: client?.companyName ?? null,
        assignedHours: assignment.assignedHours,
        comments: assignment.comments,
      },
    });

    return ok(undefined);
  }
}
