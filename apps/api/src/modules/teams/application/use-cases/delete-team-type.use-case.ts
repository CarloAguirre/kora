import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import { TeamTypeNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_TYPE_REPOSITORY, type TeamTypeRepository } from '../../domain/repositories/team-type.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface DeleteTeamTypeCommand {
  readonly typeId: string;
}

/**
 * Elimina un tipo del catálogo. Los equipos que lo tenían no se bloquean ni se
 * borran: la FK los deja sin tipo, igual que un equipo creado sin elegir uno.
 */
@Injectable()
export class DeleteTeamTypeUseCase implements UseCase<DeleteTeamTypeCommand, void, ApplicationError> {
  constructor(@Inject(TEAM_TYPE_REPOSITORY) private readonly teamTypes: TeamTypeRepository) {}

  async execute({ typeId }: DeleteTeamTypeCommand): Promise<Result<void, ApplicationError>> {
    if (!(await this.teamTypes.findById(typeId))) {
      return err(new TeamTypeNotFoundError(typeId));
    }
    await this.teamTypes.delete(typeId);
    return ok(undefined);
  }
}
