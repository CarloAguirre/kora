import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { PROJECT_OBSERVATION_DEFAULT_STATUS, type AddProjectObservationInput, type Permission } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface AddProjectObservationCommand {
  readonly projectId: string;
  readonly data: AddProjectObservationInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** Bitácora de proyecto. Sin adjuntos: pendiente de integrar Storage (ver docs/PLAN-MODULOS.md). */
@Injectable()
export class AddProjectObservationUseCase
  implements UseCase<AddProjectObservationCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: AddProjectObservationCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage')) {
      const snapshot = project.toSnapshot();
      const projectMembers = await this.members.listForProject(project.id);
      const isParticipant =
        snapshot.leaderUserId === command.actor.userId ||
        snapshot.developerUserId === command.actor.userId ||
        snapshot.commercialManagerUserId === command.actor.userId ||
        projectMembers.some((member) => member.userId === command.actor.userId);
      if (!isParticipant) return err(new ForbiddenError('No tienes acceso a este proyecto.', 'PROJECT_NOT_ASSIGNED'));
    }

    const now = this.clock.now();
    const id = await this.observations.add({
      projectId: command.projectId,
      type: command.data.type,
      title: command.data.title?.trim() || null,
      message: command.data.message,
      status: PROJECT_OBSERVATION_DEFAULT_STATUS[command.data.type],
      moduleId: command.data.moduleId ?? null,
      date: command.data.date ? new Date(`${command.data.date}T00:00:00`) : now,
      authorUserId: command.actor.userId,
      now,
    });

    return ok({ id });
  }
}
