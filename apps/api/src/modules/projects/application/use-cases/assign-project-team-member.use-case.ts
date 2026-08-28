import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { AssignProjectTeamMemberInput } from '@kora/contracts';
import {
  InvalidTeamMemberAssignmentError,
  ProjectNotFoundError,
  ProjectTeamMemberAlreadyAssignedError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import {
  PROJECT_TEAM_MEMBER_VALIDATOR,
  type ProjectTeamMemberValidator,
} from '../ports/project-team-member-validator.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface AssignProjectTeamMemberCommand {
  readonly projectId: string;
  readonly data: AssignProjectTeamMemberInput;
  readonly actor: ActorContext;
}

@Injectable()
export class AssignProjectTeamMemberUseCase
  implements UseCase<AssignProjectTeamMemberCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_MEMBER_VALIDATOR) private readonly validator: ProjectTeamMemberValidator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: AssignProjectTeamMemberCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const { projectId, data, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    if (!(await this.validator.isActiveTeamMember(data.teamMemberId))) {
      return err(new InvalidTeamMemberAssignmentError());
    }

    const existing = await this.members.findByProjectAndTeamMember(projectId, data.teamMemberId);
    if (existing) return err(new ProjectTeamMemberAlreadyAssignedError());

    const id = await this.members.assign({
      projectId,
      teamMemberId: data.teamMemberId,
      activity: data.activity || null,
      assignedHours: data.assignedHours,
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: projectId,
      metadata: { event: 'member_assigned', teamMemberId: data.teamMemberId },
    });

    return ok({ id });
  }
}
