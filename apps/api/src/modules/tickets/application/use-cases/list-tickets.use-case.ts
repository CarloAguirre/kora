import { Inject, Injectable } from '@nestjs/common';
import { buildPage, mapPage, ok, type Page, type Result } from '@kora/core';
import type { ListTicketsQuery, Permission, TicketSummary } from '@kora/contracts';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { toTicketSummary } from '../mappers/ticket.mapper';

export interface ListTicketsQueryCommand {
  readonly query: ListTicketsQuery;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Sin `tickets:read` (alcance completo), el actor solo puede listar los
 * tickets que tiene asignados — `tickets:read_assigned` da acceso al mismo
 * endpoint, pero el caso de uso fuerza el filtro a su propio `userId`.
 */
@Injectable()
export class ListTicketsUseCase implements UseCase<ListTicketsQueryCommand, Page<TicketSummary>, never> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
  ) {}

  async execute(command: ListTicketsQueryCommand): Promise<Result<Page<TicketSummary>, never>> {
    const { query, actor, actorPermissions } = command;
    const hasFullRead = actorPermissions.includes('tickets:read');

    // `query.projectId` llega como el slug de la URL (`SupportProjectDetailView`), no como UUID.
    const project = query.projectId ? await this.projects.findById(query.projectId) : null;
    if (query.projectId && !project) return ok(buildPage<TicketSummary>([], 0, { page: query.page, pageSize: query.pageSize }));

    const page = await this.tickets.search(
      {
        search: query.search,
        clientId: query.clientId,
        projectId: project?.id,
        assigneeUserId: hasFullRead ? query.assigneeUserId : [actor.userId],
        status: query.status,
        priority: query.priority,
      },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toTicketSummary));
  }
}
