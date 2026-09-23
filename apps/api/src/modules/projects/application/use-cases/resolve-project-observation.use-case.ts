import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { PROJECT_OBSERVATION_ALLOWED_TRANSITIONS, type Permission, type ResolveProjectObservationInput } from '@kora/contracts';
import {
  CannotResolveProjectObservationError,
  InvalidProjectObservationTransitionError,
  ProjectNotFoundError,
  ProjectObservationNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ResolveProjectObservationCommand {
  readonly projectId: string;
  readonly observationId: string;
  readonly data: ResolveProjectObservationInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Aprobar/rechazar un compromiso, o cerrar/reabrir un incidente — a diferencia de
 * `UpdateProjectObservationUseCase` (editar el mensaje, reservado al autor), esto lo
 * resuelve quien administra los pendientes del proyecto: el líder de proyecto, PMO o
 * admin (`projects:manage`), sea o no quien creó la entrada.
 */
@Injectable()
export class ResolveProjectObservationUseCase
  implements UseCase<ResolveProjectObservationCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResolveProjectObservationCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const observation = await this.observations.findById(command.observationId);
    if (!observation || observation.projectId !== project.id) {
      return err(new ProjectObservationNotFoundError(command.observationId));
    }

    const canResolve =
      command.actorPermissions.includes('projects:manage') || project.leaderUserId === command.actor.userId;
    if (!canResolve) return err(new CannotResolveProjectObservationError());

    const allowedNextStatuses = observation.status
      ? PROJECT_OBSERVATION_ALLOWED_TRANSITIONS[observation.type]?.[observation.status]
      : undefined;
    if (!allowedNextStatuses?.includes(command.data.status)) {
      return err(new InvalidProjectObservationTransitionError());
    }

    await this.observations.updateStatus(command.observationId, command.data.status, this.clock.now());

    return ok(undefined);
  }
}
