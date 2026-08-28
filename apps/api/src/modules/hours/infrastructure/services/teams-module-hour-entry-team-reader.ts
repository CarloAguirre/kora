import { Inject, Injectable } from '@nestjs/common';
import { TEAM_REPOSITORY, type TeamRepository } from '../../../teams/domain/repositories/team.repository';
import type { HourEntryTeamReader } from '../../application/ports/hour-entry-team-reader.port';

@Injectable()
export class TeamsModuleHourEntryTeamReader implements HourEntryTeamReader {
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}

  isTeamLeaderOfMember(leaderUserId: string, memberUserId: string): Promise<boolean> {
    return this.teams.isTeamLeaderOfMember(leaderUserId, memberUserId);
  }

  findTeamMemberUserIds(leaderUserId: string): Promise<string[]> {
    return this.teams.findMemberUserIdsForLeader(leaderUserId);
  }

  findTeamForUser(userId: string): Promise<{ id: string; name: string } | null> {
    return this.teams.findActiveTeamForUser(userId);
  }
}
