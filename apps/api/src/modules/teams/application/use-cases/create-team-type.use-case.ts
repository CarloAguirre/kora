import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { CreateTeamTypeInput, TeamType } from '@kora/contracts';
import { TeamTypeNameAlreadyInUseError } from '../../domain/errors/team.errors';
import { TEAM_TYPE_REPOSITORY, type TeamTypeRepository } from '../../domain/repositories/team-type.repository';
import type { UseCase } from '../../../../shared/application/use-case';

@Injectable()
export class CreateTeamTypeUseCase implements UseCase<CreateTeamTypeInput, TeamType, ApplicationError> {
  constructor(
    @Inject(TEAM_TYPE_REPOSITORY) private readonly teamTypes: TeamTypeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(data: CreateTeamTypeInput): Promise<Result<TeamType, ApplicationError>> {
    if (await this.teamTypes.nameIsTaken(data.name)) {
      return err(new TeamTypeNameAlreadyInUseError(data.name));
    }

    const created = await this.teamTypes.create({
      id: this.ids.generate(),
      name: data.name,
      color: data.color,
      icon: data.icon,
      now: this.clock.now(),
    });

    return ok({ id: created.id, name: created.name, color: created.color, icon: created.icon });
  }
}
