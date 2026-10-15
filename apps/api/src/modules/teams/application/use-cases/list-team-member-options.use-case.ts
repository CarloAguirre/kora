import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import type { TeamMemberOption } from '@kora/contracts';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import type { UseCase } from '../../../../shared/application/use-case';

/**
 * Alimenta el buscador de personas al asignar a un proyecto: a diferencia de
 * `GetTeamUseCase`, no está acotado a un equipo — un proyecto reúne gente de
 * distintos equipos (UX, DEV, QA...). Los deshabilitados quedan fuera: siguen
 * en su equipo hasta que los saquen, pero ya no se les asigna trabajo.
 */
@Injectable()
export class ListTeamMemberOptionsUseCase implements UseCase<void, TeamMemberOption[]> {
  constructor(@Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository) {}

  async execute(): Promise<Result<TeamMemberOption[]>> {
    const members = await this.members.listAllActive();
    return ok(
      members.filter((member) => member.userStatus !== 'disabled').map((member) => ({
        id: member.id,
        fullName: member.userFullName,
        teamId: member.teamId,
        teamName: member.teamName,
      })),
    );
  }
}
