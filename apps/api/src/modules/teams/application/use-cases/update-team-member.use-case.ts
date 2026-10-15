import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { UpdateTeamMemberInput } from '@kora/contracts';
import { TeamMemberNotFoundError, TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
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
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
  ) {}

  async execute(command: UpdateTeamMemberCommand): Promise<Result<void, ApplicationError>> {
    const { teamId, memberId, data } = command;

    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    const member = await this.members.findActiveById(memberId);
    if (!member || member.teamId !== team.id) return err(new TeamMemberNotFoundError(memberId));

    await this.members.updateDetails(memberId, {
      ...(data.position !== undefined ? { position: data.position || null } : {}),
      ...(data.weeklyHours !== undefined ? { weeklyHours: data.weeklyHours } : {}),
    });

    return ok(undefined);
  }
}
