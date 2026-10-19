import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { UpdateTeamTypeInput } from '@kora/contracts';
import { TeamTypeNameAlreadyInUseError, TeamTypeNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_TYPE_REPOSITORY, type TeamTypeRepository } from '../../domain/repositories/team-type.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface UpdateTeamTypeCommand {
  readonly typeId: string;
  readonly data: UpdateTeamTypeInput;
}

@Injectable()
export class UpdateTeamTypeUseCase implements UseCase<UpdateTeamTypeCommand, void, ApplicationError> {
  constructor(
    @Inject(TEAM_TYPE_REPOSITORY) private readonly teamTypes: TeamTypeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ typeId, data }: UpdateTeamTypeCommand): Promise<Result<void, ApplicationError>> {
    if (!(await this.teamTypes.findById(typeId))) {
      return err(new TeamTypeNotFoundError(typeId));
    }
    if (await this.teamTypes.nameIsTaken(data.name, typeId)) {
      return err(new TeamTypeNameAlreadyInUseError(data.name));
    }

    await this.teamTypes.update(typeId, {
      name: data.name,
      color: data.color,
      icon: data.icon,
      now: this.clock.now(),
    });
    return ok(undefined);
  }
}
