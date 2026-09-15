import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission } from '@kora/contracts';
import { ProjectTeamMemberNotFoundError } from '../../domain/errors/project.errors';
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

export interface UnassignProjectTeamMemberCommand {
  readonly projectId: string;
  readonly assignmentId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Sin `projects:manage`, solo puede desasignar quien lidera el equipo de esa asignación. */
@Injectable()
export class UnassignProjectTeamMemberUseCase
  implements UseCase<UnassignProjectTeamMemberCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UnassignProjectTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, assignmentId, actor } = command;

    const assignment = await this.members.findById(assignmentId);
    if (!assignment || assignment.projectId !== projectId) {
      return err(new ProjectTeamMemberNotFoundError(assignmentId));
    }

    if (!command.actorPermissions.includes('projects:manage')) {
      const isTeamLeader = await this.projectTeams.isTeamLeaderForProject(projectId, assignment.teamId, actor.userId);
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta persona.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    await this.members.unassign(assignmentId);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: projectId,
      metadata: { event: 'member_unassigned', userId: assignment.userId },
    });

    return ok(undefined);
  }
}
