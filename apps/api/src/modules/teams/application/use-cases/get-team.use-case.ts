import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { TeamDetail } from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import { TEAM_USER_READER, type TeamUserReader } from '../ports/team-user-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetTeamCommand {
  readonly teamId: string;
}

@Injectable()
export class GetTeamUseCase implements UseCase<GetTeamCommand, TeamDetail, ApplicationError> {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
    @Inject(TEAM_USER_READER) private readonly users: TeamUserReader,
  ) {}

  async execute(command: GetTeamCommand): Promise<Result<TeamDetail, ApplicationError>> {
    const team = await this.teams.findById(command.teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(command.teamId));

    const [activeMembers, memberList, leader] = await Promise.all([
      this.teams.countActiveMembers(team.id),
      this.members.listActiveForTeam(team.id),
      team.leaderUserId ? this.users.findById(team.leaderUserId) : Promise.resolve(null),
    ]);

    const snapshot = team.toSnapshot();

    return ok({
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description,
      isActive: snapshot.isActive,
      leader: leader ? { id: leader.id, fullName: leader.fullName } : null,
      memberCount: activeMembers,
      members: memberList.map((member) => ({
        id: member.id,
        userId: member.userId,
        fullName: member.userFullName,
        position: member.position,
        weeklyHours: Number(member.weeklyHours),
        joinedAt: member.joinedAt.toISOString(),
      })),
      legacyId: snapshot.legacyId,
      createdAt: snapshot.createdAt.toISOString(),
      updatedAt: snapshot.updatedAt.toISOString(),
    });
  }
}
