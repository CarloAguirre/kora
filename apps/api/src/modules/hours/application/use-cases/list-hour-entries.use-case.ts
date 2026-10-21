import { Injectable, Inject } from '@nestjs/common';
import { buildPage, mapPage, ok, type Page, type Result } from '@kora/core';
import type { HourEntrySummary, ListHourEntriesQuery, Permission } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
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
 *
 * `hours:read_team` usa `leaderScopeUserId` (por fila, excluyente), NO un set
 * plano de "ids de gente en equipos que lidero" — un mismo colaborador puede
 * tener horas en un proyecto donde el actor lidera su equipo y en otro donde
 * no, porque `project_teams.leaderUserId` es por proyecto. Con el set plano
 * anterior, liderar "Desarrollo" en CUALQUIER proyecto hacía visibles las
 * horas de todo "Desarrollo" en TODOS los proyectos — reportado en producción
 * (ver docs/DECISION-M4-HORAS.md "Cuarta corrección").
 */
@Injectable()
export class ListHourEntriesUseCase implements UseCase<ListHourEntriesCommand, Page<HourEntrySummary>, never> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
  ) {}

  async execute(command: ListHourEntriesCommand): Promise<Result<Page<HourEntrySummary>, never>> {
    const { query, actor, actorPermissions } = command;

    // `query.projectId` llega como el slug de la URL (ficha de proyecto), no como UUID.
    const project = query.projectId ? await this.projects.findById(query.projectId) : null;
    if (query.projectId && !project) return ok(buildPage<HourEntrySummary>([], 0, { page: query.page, pageSize: query.pageSize }));

    let visibleToUserIds: readonly string[] | undefined;
    let leaderScopeUserId: string | undefined;
    let userId: string | undefined = query.userId;

    if (actorPermissions.includes('hours:read_all')) {
      visibleToUserIds = query.userId ? [query.userId] : undefined;
      userId = undefined;
    } else if (actorPermissions.includes('hours:read_team')) {
      leaderScopeUserId = actor.userId;
    } else {
      visibleToUserIds = [actor.userId];
      userId = undefined;
    }

    const page = await this.entries.search(
      {
        userId,
        projectId: project?.id,
        projectIds: query.projectIds,
        search: query.search,
        teamId: query.teamId,
        status: query.status,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        visibleToUserIds,
        leaderScopeUserId,
      },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toHourEntrySummary));
  }
}
