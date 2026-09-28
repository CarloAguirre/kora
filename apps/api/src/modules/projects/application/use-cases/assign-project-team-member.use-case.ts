import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { AssignProjectTeamMemberInput, Permission } from '@kora/contracts';
import {
  InvalidTeamMemberAssignmentError,
  ProjectNotFoundError,
  ProjectTeamMemberAlreadyAssignedError,
  ProjectTeamMemberLimitReachedError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
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
  readonly actorPermissions: readonly Permission[];
}

/** Sin `projects:manage`, puede asignar quien lidera el equipo del `teamMemberId` en este proyecto, o el líder DE ESTE PROYECTO. */
@Injectable()
export class AssignProjectTeamMemberUseCase
  implements UseCase<AssignProjectTeamMemberCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_TEAM_MEMBER_VALIDATOR) private readonly validator: ProjectTeamMemberValidator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: AssignProjectTeamMemberCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;

    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const projectId = project.id;

    if (!(await this.validator.isActiveTeamMember(data.teamMemberId))) {
      return err(new InvalidTeamMemberAssignmentError());
    }

    const teamId = await this.validator.findTeamId(data.teamMemberId);

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== actor.userId) {
      const isTeamLeader = teamId != null && (await this.projectTeams.isTeamLeaderForProject(projectId, teamId, actor.userId));
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta persona.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    const existing = await this.members.findByProjectAndTeamMember(projectId, data.teamMemberId);
    if (existing) return err(new ProjectTeamMemberAlreadyAssignedError());

    // `N° colaboradores` del proyecto es el tope de personas del equipo; nulo o 0 (dato viejo) = sin tope.
    const projectTeam = (await this.projectTeams.findByProject(projectId)).find((team) => team.teamId === teamId);
    if (projectTeam?.maxMembers && projectTeam.memberCount >= projectTeam.maxMembers) {
      return err(new ProjectTeamMemberLimitReachedError(projectTeam.teamName, projectTeam.maxMembers));
    }

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
