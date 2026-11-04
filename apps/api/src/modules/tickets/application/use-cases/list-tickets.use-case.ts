import { Inject, Injectable } from '@nestjs/common';
import { buildPage, mapPage, ok, type Page, type Result } from '@kora/core';
import type { ListTicketsQuery, Permission, TicketSummary } from '@kora/contracts';
import type { TicketFilters } from '../../domain/repositories/ticket.repository';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { toTicketSummary } from '../mappers/ticket.mapper';

export interface ListTicketsQueryCommand {
  readonly query: ListTicketsQuery;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/** La página más las horas de todos los tickets del filtro — ver `TicketRepository.sumHours`. */
export type TicketsPage = Page<TicketSummary> & { readonly totalHours: number };

/**
 * Sin `tickets:read` (alcance completo), el actor solo puede listar los
 * tickets que tiene asignados — `tickets:read_assigned` da acceso al mismo
 * endpoint, pero el caso de uso fuerza el filtro a su propio `userId`.
 */
@Injectable()
export class ListTicketsUseCase implements UseCase<ListTicketsQueryCommand, TicketsPage, never> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
  ) {}

  async execute(command: ListTicketsQueryCommand): Promise<Result<TicketsPage, never>> {
    const { query } = command;
    const filters = await resolveTicketFilters(command, this.projects);
    if (!filters) {
      return ok({ ...buildPage<TicketSummary>([], 0, { page: query.page, pageSize: query.pageSize }), totalHours: 0 });
    }
    const [page, totalHours] = await Promise.all([
      this.tickets.search(filters, { page: query.page, pageSize: query.pageSize }, { field: query.sortField, direction: query.sortDirection }),
      this.tickets.sumHours(filters),
    ]);

    return ok({ ...mapPage(page, toTicketSummary), totalHours });
  }
}

/**
 * Filtros del listado a partir de la query — compartido con
 * `ListTicketDailyHoursUseCase` para que el desglose del Excel cubra
 * exactamente los mismos tickets. `null` si `projectId` no resuelve a ningún
 * proyecto (el resultado es vacío).
 */
export async function resolveTicketFilters(
  command: ListTicketsQueryCommand,
  projects: TicketProjectReader,
): Promise<TicketFilters | null> {
  const { query, actor, actorPermissions } = command;
  const hasFullRead = actorPermissions.includes('tickets:read');

  // `query.projectId` llega como el slug de la URL (`SupportProjectDetailView`), no como UUID.
  const project = query.projectId ? await projects.findById(query.projectId) : null;
  if (query.projectId && !project) return null;

  return {
    search: query.search,
    clientId: query.clientId,
    projectId: project?.id,
    assigneeUserId: hasFullRead ? query.assigneeUserId : [actor.userId],
    leaderUserId: query.leaderUserId,
    status: query.status,
    priority: query.priority,
    activityBetween: query.month ? monthRange(query.month) : undefined,
  };
}

/** [primer día del mes, primer día del siguiente) en UTC, desde 'YYYY-MM'. */
function monthRange(month: string): { from: Date; to: Date } {
  const [year, monthIndex] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(year!, monthIndex! - 1, 1)), to: new Date(Date.UTC(year!, monthIndex!, 1)) };
}
