import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import type { TicketDailyHours } from '@kora/contracts';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { resolveTicketFilters, type ListTicketsQueryCommand } from './list-tickets.use-case';

/**
 * Desglose por día de las HH aprobadas de los tickets del filtro — alimenta el
 * Excel del historial, que antes solo traía el total `usedHours` por ticket.
 * Mismos filtros y mismo alcance (`tickets:read_assigned` → solo los propios)
 * que `ListTicketsUseCase`; la paginación de la query se ignora.
 */
@Injectable()
export class ListTicketDailyHoursUseCase implements UseCase<ListTicketsQueryCommand, TicketDailyHours[], never> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
  ) {}

  async execute(command: ListTicketsQueryCommand): Promise<Result<TicketDailyHours[], never>> {
    const filters = await resolveTicketFilters(command, this.projects);
    if (!filters) return ok([]);
    return ok(await this.tickets.listDailyHours(filters));
  }
}
