import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectObservationInput } from '@kora/contracts';
import { ProjectNotFoundError, ProjectObservationNotEditableError, ProjectObservationNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectObservationCommand {
  readonly projectId: string;
  readonly observationId: string;
  readonly data: UpdateProjectObservationInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Sin límite de tiempo. Puede editarla quien la creó, o quien administra los pendientes
 * del proyecto (líder de proyecto, PMO o admin — mismo criterio que `ResolveProjectObservationUseCase`).
 * Un `cambio_proyecto` (registro autogenerado) no lo edita nadie.
 */
@Injectable()
export class UpdateProjectObservationUseCase
  implements UseCase<UpdateProjectObservationCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectObservationCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const observation = await this.observations.findById(command.observationId);
    if (!observation || observation.projectId !== project.id) {
      return err(new ProjectObservationNotFoundError(command.observationId));
    }

    if (observation.type === 'cambio_proyecto') return err(new ProjectObservationNotEditableError());

    const isOwner = observation.authorUserId === command.actor.userId;
    const canManagePendings =
      command.actorPermissions.includes('projects:manage') || project.leaderUserId === command.actor.userId;
    if (!isOwner && !canManagePendings) {
      return err(new ForbiddenError('No tienes permiso para editar esta entrada.', 'PROJECT_OBSERVATION_NOT_OWNED'));
    }

    await this.observations.update(command.observationId, command.data.message, this.clock.now());

    return ok(undefined);
  }
}
