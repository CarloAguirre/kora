import { Inject, Injectable } from '@nestjs/common';
import type { TicketHhRequestSyncPort } from '../../application/ports/ticket-hh-request-sync.port';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../../tickets/domain/repositories/ticket-hh-request.repository';
import { TICKET_REPOSITORY, type TicketRepository } from '../../../tickets/domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../../tickets/domain/repositories/ticket-history.repository';

/**
 * Implementa `TicketHhRequestSyncPort` llamando directo a los repositorios del
 * módulo de tickets — mismos efectos que `Approve/RejectTicketHhRequestUseCase`
 * cuando la decisión se toma desde el ticket. Ver el puerto para el porqué de
 * este adaptador (en vez de que `HoursModule` importe `TicketsModule`).
 */
@Injectable()
export class TicketsModuleTicketHhRequestSync implements TicketHhRequestSyncPort {
  constructor(
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
  ) {}

  async onHourEntryApproved(hourEntryId: string, actorUserId: string, now: Date): Promise<void> {
    const request = await this.requests.findByHourEntryId(hourEntryId);
    if (!request || request.status !== 'pending') return;

    const approved = request.approve(actorUserId, hourEntryId, now);
    if (approved.isErr()) return;
    await this.requests.save(request);

    const ticket = await this.tickets.findById(request.ticketId);
    if (!ticket || ticket.isDeleted) return;
    ticket.recordUsedHours(ticket.usedHours + request.hours, now);
    await this.tickets.save(ticket);

    await this.history.append({
      ticketId: request.ticketId,
      eventType: 'ticket_hh_approved',
      description: `Se aprobaron ${request.hours} HH del ${request.date.toISOString().slice(0, 10)}.`,
      actorUserId,
      occurredAt: now,
    });
  }

  async onHourEntryRejected(hourEntryId: string, actorUserId: string, reason: string, now: Date): Promise<void> {
    const request = await this.requests.findByHourEntryId(hourEntryId);
    if (!request || request.status !== 'pending') return;

    const rejected = request.reject(actorUserId, reason, now);
    if (rejected.isErr()) return;
    await this.requests.save(request);

    await this.history.append({
      ticketId: request.ticketId,
      eventType: 'ticket_hh_rejected',
      description: `Se rechazó la solicitud de ${request.hours} HH: ${reason}`,
      actorUserId,
      occurredAt: now,
    });
  }
}
