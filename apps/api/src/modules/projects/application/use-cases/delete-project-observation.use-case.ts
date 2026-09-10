import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { ProjectObservationNotFoundError } from '../../domain/errors/project.errors';
import {
  PROJECT_OBSERVATION_DELETE_WINDOW_MS,
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteProjectObservationCommand {
  readonly projectId: string;
  readonly observationId: string;
  readonly actor: ActorContext;
}

/** Solo quien creó la entrada puede borrarla, y solo dentro de los 15 minutos siguientes a crearla. */
@Injectable()
export class DeleteProjectObservationUseCase
  implements UseCase<DeleteProjectObservationCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteProjectObservationCommand): Promise<Result<void, ApplicationError>> {
    const observation = await this.observations.findById(command.observationId);
    if (!observation || observation.projectId !== command.projectId) {
      return err(new ProjectObservationNotFoundError(command.observationId));
    }

    if (observation.authorUserId !== command.actor.userId) {
      return err(new ForbiddenError('Solo quien creó esta entrada puede borrarla.', 'PROJECT_OBSERVATION_NOT_OWNED'));
    }

    const elapsedMs = this.clock.now().getTime() - observation.createdAt.getTime();
    if (elapsedMs > PROJECT_OBSERVATION_DELETE_WINDOW_MS) {
      return err(
        new ForbiddenError(
          'Ya no se puede borrar esta entrada: pasaron más de 15 minutos desde que se creó.',
          'PROJECT_OBSERVATION_DELETE_WINDOW_EXPIRED',
        ),
      );
    }

    await this.observations.remove(command.observationId);

    return ok(undefined);
  }
}
