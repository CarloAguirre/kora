import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { UpdateProjectObservationInput } from '@kora/contracts';
import { ProjectObservationNotFoundError } from '../../domain/errors/project.errors';
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
}

/** Solo quien creó la entrada puede editarla; sin límite de tiempo. */
@Injectable()
export class UpdateProjectObservationUseCase
  implements UseCase<UpdateProjectObservationCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectObservationCommand): Promise<Result<void, ApplicationError>> {
    const observation = await this.observations.findById(command.observationId);
    if (!observation || observation.projectId !== command.projectId) {
      return err(new ProjectObservationNotFoundError(command.observationId));
    }

    if (observation.authorUserId !== command.actor.userId) {
      return err(new ForbiddenError('Solo quien creó esta entrada puede editarla.', 'PROJECT_OBSERVATION_NOT_OWNED'));
    }

    await this.observations.update(command.observationId, command.data.message, this.clock.now());

    return ok(undefined);
  }
}
