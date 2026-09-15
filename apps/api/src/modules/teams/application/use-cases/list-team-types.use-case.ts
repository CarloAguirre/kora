import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { TeamType } from '@kora/contracts';
import { TEAM_TYPE_REPOSITORY, type TeamTypeRepository } from '../../domain/repositories/team-type.repository';
import type { UseCase } from '../../../../shared/application/use-case';

@Injectable()
export class ListTeamTypesUseCase implements UseCase<void, TeamType[], ApplicationError> {
  constructor(@Inject(TEAM_TYPE_REPOSITORY) private readonly teamTypes: TeamTypeRepository) {}

  async execute(): Promise<Result<TeamType[], ApplicationError>> {
    const types = await this.teamTypes.list();
    return ok(types.map((type) => ({ id: type.id, name: type.name, color: type.color, icon: type.icon })));
  }
}
