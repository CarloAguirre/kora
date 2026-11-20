import { Inject, Injectable } from '@nestjs/common';
import { isForecastAssignableRole } from '@kora/contracts';
import { TEAM_REPOSITORY, type TeamRepository } from '../../../teams/domain/repositories/team.repository';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRecord,
  type TeamMemberRepository,
} from '../../../teams/domain/repositories/team-member.repository';
import type {
  ForecastTeamMemberReference,
  ForecastTeamReader,
  ForecastTeamReference,
} from '../../application/ports/forecast-team-reader.port';

/** Sin líderes, PMO ni admin, y sin usuarios deshabilitados o bloqueados. */
const isForecastMember = (member: TeamMemberRecord) =>
  member.userStatus === 'active' && isForecastAssignableRole(member.userRole);

@Injectable()
export class TeamsModuleForecastTeamReader implements ForecastTeamReader {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
  ) {}

  async findTeamById(teamId: string): Promise<ForecastTeamReference | null> {
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return null;
    return { id: team.id, name: team.name, leaderUserId: team.leaderUserId };
  }

  async findMemberById(teamMemberId: string): Promise<ForecastTeamMemberReference | null> {
    const member = await this.members.findActiveById(teamMemberId);
    if (!member) return null;

    const team = await this.teams.findById(member.teamId);
    if (!team) return null;

    return {
      id: member.id,
      teamId: member.teamId,
      teamName: team.name,
      userId: member.userId,
      fullName: member.userFullName,
      weeklyHours: member.weeklyHours,
    };
  }

  async listActiveMembers(teamId: string): Promise<ForecastTeamMemberReference[]> {
    const [team, members] = await Promise.all([this.teams.findById(teamId), this.members.listActiveForTeam(teamId)]);
    const teamName = team?.name ?? '';

    return members.filter(isForecastMember).map((member) => ({
      id: member.id,
      teamId: member.teamId,
      teamName,
      userId: member.userId,
      fullName: member.userFullName,
      weeklyHours: member.weeklyHours,
    }));
  }

  async listAllActiveMembers(): Promise<ForecastTeamMemberReference[]> {
    const members = await this.members.listAllActive();
    return members.filter(isForecastMember).map((member) => ({
      id: member.id,
      teamId: member.teamId,
      teamName: member.teamName,
      userId: member.userId,
      fullName: member.userFullName,
      weeklyHours: member.weeklyHours,
    }));
  }

  async isTeamLeader(teamId: string, userId: string): Promise<boolean> {
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return false;
    return this.teams.leadsTeam(userId, teamId);
  }
}
