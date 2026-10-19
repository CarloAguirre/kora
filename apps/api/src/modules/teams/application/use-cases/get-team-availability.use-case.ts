import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { TeamAvailabilityResponse } from '@kora/contracts';
import { TeamNotFoundError } from '../../domain/errors/team.errors';
import { TEAM_REPOSITORY, type TeamRepository } from '../../domain/repositories/team.repository';
import {
  TEAM_MEMBER_REPOSITORY,
  type TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetTeamAvailabilityCommand {
  readonly teamId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Heatmap de `/horas/aprobaciones` — horas aprobadas y pendientes de aprobación por miembro y día en un rango.
 * A diferencia del forecast (M6), refleja trabajo ya realizado, no planificado.
 */
@Injectable()
export class GetTeamAvailabilityUseCase
  implements UseCase<GetTeamAvailabilityCommand, TeamAvailabilityResponse, ApplicationError>
{
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private readonly members: TeamMemberRepository,
  ) {}

  async execute(command: GetTeamAvailabilityCommand): Promise<Result<TeamAvailabilityResponse, ApplicationError>> {
    const { teamId, dateFrom, dateTo } = command;
    const team = await this.teams.findById(teamId);
    if (!team || team.isDeleted) return err(new TeamNotFoundError(teamId));

    const dates = enumerateDates(dateFrom, dateTo);
    const [activeMembers, hoursByMemberAndDate] = await Promise.all([
      this.members.listActiveForTeam(team.id),
      this.teams.getHoursByMemberAndDate(team.id, new Date(`${dateFrom}T00:00:00.000Z`), new Date(`${dateTo}T00:00:00.000Z`)),
    ]);

    const hoursByMemberId = new Map<string, Map<string, { approved: number; pending: number }>>();
    for (const row of hoursByMemberAndDate) {
      const byDate = hoursByMemberId.get(row.teamMemberId) ?? new Map<string, { approved: number; pending: number }>();
      byDate.set(row.date, { approved: row.approvedHours, pending: row.pendingHours });
      hoursByMemberId.set(row.teamMemberId, byDate);
    }

    return ok({
      teamId: team.id,
      members: activeMembers.map((member) => {
        const byDate = hoursByMemberId.get(member.id);
        return {
          teamMemberId: member.id,
          userId: member.userId,
          fullName: member.userFullName,
          weeklyHours: Number(member.weeklyHours),
          days: dates.map((date) => ({
            date,
            hours: byDate?.get(date)?.approved ?? 0,
            pendingHours: byDate?.get(date)?.pending ?? 0,
          })),
        };
      }),
    });
  }
}
