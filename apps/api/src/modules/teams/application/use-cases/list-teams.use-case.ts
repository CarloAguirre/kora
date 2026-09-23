import { Inject, Injectable } from '@nestjs/common';
import { mapPage, ok, type Page, type Result } from '@kora/core';
import type { ListTeamsQuery, TeamSummary } from '@kora/contracts';
import { TEAM_REPOSITORY, type TeamListItem, type TeamRepository } from '../../domain/repositories/team.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListTeamsQueryCommand {
  readonly query: ListTeamsQuery;
}

@Injectable()
export class ListTeamsUseCase implements UseCase<ListTeamsQueryCommand, Page<TeamSummary>> {
  constructor(@Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository) {}

  async execute(command: ListTeamsQueryCommand): Promise<Result<Page<TeamSummary>>> {
    const { query } = command;

    const page = await this.teams.search(
      { search: query.search, isActive: query.isActive, leaderUserId: query.leaderUserId },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toSummary));
  }
}

function toSummary(item: TeamListItem): TeamSummary {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description,
    isActive: item.isActive,
    leader: item.leaderUserId ? { id: item.leaderUserId, fullName: item.leaderName ?? '' } : null,
    teamType: item.teamTypeId
      ? { id: item.teamTypeId, name: item.teamTypeName ?? '', color: item.teamTypeColor ?? '', icon: item.teamTypeIcon ?? '' }
      : null,
    memberCount: item.memberCount,
    createdAt: item.createdAt.toISOString(),
  };
}
