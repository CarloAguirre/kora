import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { isAdminTier, type RoleCode } from '@kora/contracts';
import { CannotDeleteClosedTicketError, CannotDeleteTicketError, TicketNotFoundError } from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteTicketCommand {
  readonly ticketId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Baja lógica. El historial del ticket se conserva íntegro.
 *
 * Borrar es más restrictivo que gestionar: admin/PMO siempre puede; un líder
 * solo si es el responsable del ticket o tiene autoridad sobre su proyecto
 * (líder del proyecto o de un equipo asignado a él) — mismo criterio que la
 * v1, donde sólo el responsable o el líder relacionado con el ticket podían
 * eliminarlo, no cualquier líder con permiso general de gestión.
 *
 * Un ticket cerrado (el que se ve en "Historial de tickets") solo lo puede
 * eliminar admin/PMO — ni el responsable ni el líder del proyecto.
 */
@Injectable()
export class DeleteTicketUseCase implements UseCase<DeleteTicketCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteTicketCommand): Promise<Result<void, ApplicationError>> {
    const ticket = await this.tickets.findById(command.ticketId);
    if (!ticket) return err(new TicketNotFoundError(command.ticketId));

    if (!isAdminTier(command.actorRole)) {
      if (ticket.status === 'closed') return err(new CannotDeleteClosedTicketError());
      const isAssignee = ticket.assigneeUserId === command.actor.userId;
      const isApprover = ticket.projectId
        ? await this.projects.isProjectApprover(ticket.projectId, command.actor.userId, ticket.assigneeUserId)
        : false;
      if (!isAssignee && !isApprover) return err(new CannotDeleteTicketError());
    }

    const now = this.clock.now();
    const result = ticket.softDelete(now);
    if (result.isErr()) return err(result.error);

    await this.tickets.save(ticket);
    await this.history.append({
      ticketId: ticket.id,
      eventType: 'ticket_deleted',
      description: 'Ticket eliminado.',
      actorUserId: command.actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'delete',
      entityType: 'ticket',
      entityId: ticket.id,
    });

    return ok(undefined);
  }
}
