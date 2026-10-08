import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { isAdminTier, type RoleCode, type UpdateForecastAssignmentInput } from '@kora/contracts';
import {
  ForbiddenForecastAccessError,
  ForecastAssignmentNotFoundError,
  ReferencedClientNotFoundError,
  ReferencedProjectNotFoundError,
  ReferencedTeamMemberNotFoundError,
} from '../../domain/errors/forecast.errors';
import { FORECAST_ASSIGNMENT_REPOSITORY, type ForecastAssignmentRepository } from '../../domain/repositories/forecast-assignment.repository';
import { FORECAST_CLIENT_READER, type ForecastClientReader } from '../ports/forecast-client-reader.port';
import { FORECAST_PROJECT_READER, type ForecastProjectReader } from '../ports/forecast-project-reader.port';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateForecastAssignmentCommand {
  readonly assignmentId: string;
  readonly data: UpdateForecastAssignmentInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class UpdateForecastAssignmentUseCase implements UseCase<UpdateForecastAssignmentCommand, void, ApplicationError> {
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    @Inject(FORECAST_PROJECT_READER) private readonly projects: ForecastProjectReader,
    @Inject(FORECAST_CLIENT_READER) private readonly clients: ForecastClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateForecastAssignmentCommand): Promise<Result<void, ApplicationError>> {
    const { assignmentId, data, actor, actorRole } = command;
    const now = this.clock.now();

    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) return err(new ForecastAssignmentNotFoundError(assignmentId));

    const member = await this.teams.findMemberById(assignment.teamMemberId);
    if (!member) return err(new ReferencedTeamMemberNotFoundError(assignment.teamMemberId));

    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(member.teamId, actor.userId))) {
      return err(new ForbiddenForecastAccessError());
    }

    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
    }
    if (data.clientId) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    const updated = assignment.updateDetails(
      {
        type: data.type,
        projectId: data.projectId,
        clientId: data.clientId,
        comments: data.comments,
        assignedHours: data.assignedHours,
      },
      now,
      actor.userId,
    );
    if (updated.isErr()) return err(updated.error);

    await this.assignments.save(assignment);

    const [finalProject, finalClient] = await Promise.all([
      assignment.projectId ? this.projects.findById(assignment.projectId) : Promise.resolve(null),
      assignment.clientId ? this.clients.findById(assignment.clientId) : Promise.resolve(null),
    ]);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'forecast_assignment',
      entityId: assignment.id,
      metadata: {
        teamId: member.teamId,
        teamName: member.teamName,
        periodStart: assignment.periodStart.toISOString().slice(0, 10),
        periodEnd: assignment.periodEnd.toISOString().slice(0, 10),
        memberFullName: member.fullName,
        type: assignment.type,
        projectName: finalProject?.name ?? null,
        clientName: finalClient?.companyName ?? null,
        assignedHours: assignment.assignedHours,
        comments: assignment.comments,
      },
    });

    return ok(undefined);
  }
}
