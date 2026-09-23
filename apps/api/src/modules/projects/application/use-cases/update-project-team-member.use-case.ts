import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission, UpdateProjectTeamMemberInput } from '@kora/contracts';
import { ProjectNotFoundError, ProjectTeamMemberNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectTeamMemberCommand {
  readonly projectId: string;
  readonly assignmentId: string;
  readonly data: UpdateProjectTeamMemberInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Sin `projects:manage`, solo puede editar quien lidera el equipo de esa asignación. */
@Injectable()
export class UpdateProjectTeamMemberUseCase
  implements UseCase<UpdateProjectTeamMemberCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateProjectTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, assignmentId, data, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    const assignment = await this.members.findById(assignmentId);
    if (!assignment || assignment.projectId !== project.id) {
      return err(new ProjectTeamMemberNotFoundError(assignmentId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== actor.userId) {
      const isTeamLeader = await this.projectTeams.isTeamLeaderForProject(project.id, assignment.teamId, actor.userId);
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta persona.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    await this.members.update(assignmentId, {
      ...(data.activity !== undefined ? { activity: data.activity } : {}),
      ...(data.assignedHours !== undefined ? { assignedHours: data.assignedHours } : {}),
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'member_updated', userId: assignment.userId },
    });

    return ok(undefined);
  }
}
