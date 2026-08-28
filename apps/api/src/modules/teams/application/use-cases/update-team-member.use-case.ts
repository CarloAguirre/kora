import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { UpdateTeamMemberInput } from '@kora/contracts';
import { TeamMemberNotFoundError } from '../../domain/errors/team.errors';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface UpdateTeamMemberCommand {
  readonly teamId: string;
  readonly memberId: string;
  readonly data: UpdateTeamMemberInput;
}

@Injectable()
export class UpdateTeamMemberUseCase
  implements UseCase<UpdateTeamMemberCommand, void, ApplicationError>
{
  constructor(@Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository) {}

  async execute(command: UpdateTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { teamId, memberId, data } = command;

    const member = await this.members.findActiveById(memberId);
    if (!member || member.teamId !== teamId) return err(new TeamMemberNotFoundError(memberId));

    await this.members.updateDetails(memberId, {
      ...(data.position !== undefined ? { position: data.position || null } : {}),
      ...(data.weeklyHours !== undefined ? { weeklyHours: data.weeklyHours } : {}),
    });

    return ok(undefined);
  }
}
