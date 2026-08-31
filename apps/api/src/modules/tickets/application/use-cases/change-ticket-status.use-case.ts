import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  nextForwardTicketStatus,
  type ChangeTicketStatusInput,
  type Permission,
} from '@kora/contracts';
import {
  CannotManageTicketError,
  InvalidTicketStatusTransitionError,
  TicketHasPendingHhRequestsError,
  TicketNotFoundError,
  TicketRequiresAssigneeError,
  TicketResolutionRequiredError,
} from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { canManageTicket } from '../services/ticket-access';

export interface ChangeTicketStatusCommand {
  readonly ticketId: string;
  readonly data: ChangeTicketStatusInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * El flujo de estados es forzado (ver docs/DECISION-M5-TICKETS.md): un avance
 * solo puede ser el siguiente paso legal (`nextForwardTicketStatus`), exige
 * responsable para salir de `pending`, solución registrada para llegar a
 * `done`, y ninguna solicitud de HH pendiente para llegar a `closed`. Un
 * retroceso (reapertura) no lleva ninguna de estas validaciones — igual que
 * en la v1, donde `ticket_reopened` es un evento frecuente y no forzado.
 */
@Injectable()
export class ChangeTicketStatusUseCase implements UseCase<ChangeTicketStatusCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly hhRequests: TicketHhRequestRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeTicketStatusCommand): Promise<Result<void, ApplicationError>> {
    const ticket = await this.tickets.findById(command.ticketId);
    if (!ticket || ticket.isDeleted) return err(new TicketNotFoundError(command.ticketId));

    if (!(await canManageTicket(ticket, command.actor.userId, command.actorPermissions, this.projects))) {
      return err(new CannotManageTicketError());
    }

    const previousStatus = ticket.status;
    const targetStatus = command.data.status;
    if (previousStatus === targetStatus) return ok(undefined);

    const isForwardMove = TICKET_STATUS_ORDER[targetStatus] > TICKET_STATUS_ORDER[previousStatus];
    if (isForwardMove) {
      if (previousStatus === 'pending' && !ticket.assigneeUserId) return err(new TicketRequiresAssigneeError());
      if (targetStatus !== nextForwardTicketStatus(previousStatus, ticket.serviceType)) {
        return err(new InvalidTicketStatusTransitionError());
      }
      if (targetStatus === 'done' && !ticket.resolution?.trim()) return err(new TicketResolutionRequiredError());
      if (targetStatus === 'closed') {
        const requests = await this.hhRequests.listForTicket(ticket.id);
        if (requests.some((request) => request.status === 'pending')) return err(new TicketHasPendingHhRequestsError());
      }
    }

    const now = this.clock.now();
    const { reopened } = ticket.changeStatus(targetStatus, now);
    await this.tickets.save(ticket);

    await this.history.append({
      ticketId: ticket.id,
      eventType: reopened ? 'ticket_reopened' : command.data.status === 'closed' ? 'ticket_closed' : 'status_changed',
      description: `Estado cambiado de "${TICKET_STATUS_LABELS[previousStatus]}" a "${TICKET_STATUS_LABELS[command.data.status]}".`,
      actorUserId: command.actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'ticket',
      entityId: ticket.id,
      changes: { status: { before: previousStatus, after: command.data.status } },
    });

    return ok(undefined);
  }
}
