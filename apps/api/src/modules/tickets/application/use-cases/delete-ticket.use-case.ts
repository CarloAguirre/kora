import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import { isAdminTier, type RoleCode } from '@kora/contracts';
import {
  CannotDeleteClosedTicketError,
  CannotDeleteTicketError,
  CannotDeleteTicketWithApprovedHoursError,
  TicketNotFoundError,
} from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../../../hours/application/ports/hour-entry-project-reader.port';
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
 *
 * Las solicitudes de HH del ticket y los `hour_entries` que generaron se
 * borran de verdad junto con él: antes quedaban vivas en el registro de horas
 * de la persona, sin ticket al que remitir (p. ej. TK-1208, un ticket de
 * prueba borrado al minuto que dejó 3 HH aprobadas). Si alguna ya estaba
 * aprobada, solo quien tiene autoridad sobre el proyecto (o admin/PMO) puede
 * eliminar el ticket — mismo criterio que borrar una hora aprobada en
 * `DeleteHourEntryUseCase` — y se recalcula el consumo del proyecto.
 */
@Injectable()
export class DeleteTicketUseCase implements UseCase<DeleteTicketCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly hourProjects: HourEntryProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteTicketCommand): Promise<Result<void, ApplicationError>> {
    const ticket = await this.tickets.findById(command.ticketId);
    if (!ticket) return err(new TicketNotFoundError(command.ticketId));

    const requests = await this.requests.listForTicket(ticket.id);
    const hasApprovedHours = requests.some((request) => request.status === 'approved');

    if (!isAdminTier(command.actorRole)) {
      if (ticket.status === 'closed') return err(new CannotDeleteClosedTicketError());
      const isAssignee = ticket.assigneeUserId === command.actor.userId;
      const isApprover = ticket.projectId
        ? await this.projects.isProjectApprover(ticket.projectId, command.actor.userId, ticket.assigneeUserId)
        : false;
      if (!isAssignee && !isApprover) return err(new CannotDeleteTicketError());
      if (hasApprovedHours && !isApprover) return err(new CannotDeleteTicketWithApprovedHoursError());
    }

    const now = this.clock.now();
    const result = ticket.softDelete(now);
    if (result.isErr()) return err(result.error);

    const hourEntryIds = requests.map((request) => request.hourEntryId).filter((id): id is string => id !== null);
    if (requests.length > 0) ticket.recordUsedHours(0, now);

    await this.unitOfWork.run(async (tx) => {
      await this.requests.deleteForTicket(ticket.id, tx);
      for (const entryId of hourEntryIds) await this.hourEntries.delete(entryId, tx);
      await this.tickets.save(ticket, tx);
    });

    const affectedProjectIds = new Set(requests.filter((request) => request.status === 'approved').map((request) => request.projectId));
    for (const projectId of affectedProjectIds) {
      const usedHours = await this.hourEntries.sumApprovedHoursForProject(projectId);
      await this.hourProjects.recalculateUsedHours(projectId, usedHours);
    }

    const deletedHours = Math.round(requests.reduce((sum, request) => sum + request.hours, 0) * 100) / 100;
    await this.history.append({
      ticketId: ticket.id,
      eventType: 'ticket_deleted',
      description: deletedHours > 0 ? `Ticket eliminado, junto con sus ${deletedHours} HH registradas.` : 'Ticket eliminado.',
      actorUserId: command.actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'delete',
      entityType: 'ticket',
      entityId: ticket.id,
      metadata: hourEntryIds.length > 0 ? { deletedHourEntryIds: hourEntryIds, deletedHours } : undefined,
    });

    return ok(undefined);
  }
}
