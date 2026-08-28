import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import { isAdminTier, type CreateForecastAssignmentInput, type RoleCode } from '@kora/contracts';
import { ForecastAssignment } from '../../domain/entities/forecast-assignment.entity';
import {
  ForbiddenForecastAccessError,
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

export interface CreateForecastAssignmentCommand {
  readonly data: CreateForecastAssignmentInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class CreateForecastAssignmentUseCase implements UseCase<CreateForecastAssignmentCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    @Inject(FORECAST_PROJECT_READER) private readonly projects: ForecastProjectReader,
    @Inject(FORECAST_CLIENT_READER) private readonly clients: ForecastClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateForecastAssignmentCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor, actorRole } = command;
    const now = this.clock.now();

    const member = await this.teams.findMemberById(data.teamMemberId);
    if (!member) return err(new ReferencedTeamMemberNotFoundError(data.teamMemberId));

    if (!isAdminTier(actorRole) && !(await this.teams.isTeamLeader(member.teamId, actor.userId))) {
      return err(new ForbiddenForecastAccessError());
    }

    let projectName: string | null = null;
    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));
      projectName = project.name;
    }

    let clientName: string | null = null;
    if (data.clientId) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
      clientName = client.companyName;
    }

    const created = ForecastAssignment.create({
      id: this.ids.generate(),
      teamMemberId: data.teamMemberId,
      periodStart: new Date(`${data.periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${data.periodEnd}T00:00:00.000Z`),
      type: data.type,
      projectId: data.projectId,
      clientId: data.clientId,
      comments: data.comments,
      assignedHours: data.assignedHours,
      now,
    });
    if (created.isErr()) return err(created.error);
    const assignment = created.value;

    await this.assignments.save(assignment);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'forecast_assignment',
      entityId: assignment.id,
      metadata: {
        teamId: member.teamId,
        teamName: member.teamName,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        memberFullName: member.fullName,
        type: data.type,
        projectName,
        clientName,
        assignedHours: data.assignedHours,
        comments: data.comments ?? '',
      },
    });

    return ok({ id: assignment.id });
  }
}
