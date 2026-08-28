import { Inject, Injectable } from '@nestjs/common';
import { mapPage, ok, type Page, type Result } from '@kora/core';
import type { HourEntrySummary, ListHourEntriesQuery, Permission } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_TEAM_READER, type HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { toHourEntrySummary } from '../mappers/hour-entry.mapper';

export interface ListHourEntriesCommand {
  readonly query: ListHourEntriesQuery;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * El alcance de visibilidad se resuelve aquí, no en el cliente: `hours:read_all`
 * ve todo, `hours:read_team` ve lo propio más lo de su equipo, y sin ninguno
 * de los dos solo se ven las propias — igual que las políticas RLS de la v1,
 * pero como una decisión explícita del caso de uso.
 */
@Injectable()
export class ListHourEntriesUseCase implements UseCase<ListHourEntriesCommand, Page<HourEntrySummary>, never> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_TEAM_READER) private readonly teams: HourEntryTeamReader,
  ) {}

  async execute(command: ListHourEntriesCommand): Promise<Result<Page<HourEntrySummary>, never>> {
    const { query, actor, actorPermissions } = command;

    let visibleToUserIds: readonly string[] | undefined;
    if (actorPermissions.includes('hours:read_all')) {
      visibleToUserIds = query.userId ? [query.userId] : undefined;
    } else if (actorPermissions.includes('hours:read_team')) {
      const teamMemberIds = await this.teams.findTeamMemberUserIds(actor.userId);
      const scoped = new Set([actor.userId, ...teamMemberIds]);
      visibleToUserIds = query.userId && scoped.has(query.userId) ? [query.userId] : [...scoped];
    } else {
      visibleToUserIds = [actor.userId];
    }

    const page = await this.entries.search(
      {
        projectId: query.projectId,
        search: query.search,
        status: query.status,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        visibleToUserIds,
      },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toHourEntrySummary));
  }
}
