import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { TicketHhRequest as TicketHhRequestDto } from '@kora/contracts';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { toTicketHhRequestDto } from '../mappers/ticket-hh-request.mapper';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListTicketHhRequestsCommand {
  readonly ticketId: string;
}

@Injectable()
export class ListTicketHhRequestsUseCase implements UseCase<ListTicketHhRequestsCommand, TicketHhRequestDto[], ApplicationError> {
  constructor(@Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository) {}

  async execute(command: ListTicketHhRequestsCommand): Promise<Result<TicketHhRequestDto[], ApplicationError>> {
    const items = await this.requests.listForTicket(command.ticketId);
    return ok(items.map(toTicketHhRequestDto));
  }
}
