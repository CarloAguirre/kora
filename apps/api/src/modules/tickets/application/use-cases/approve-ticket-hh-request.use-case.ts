import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { HourEntry } from '../../../hours/domain/entities/hour-entry.entity';
import { TicketNotFoundError } from '../../domain/errors/ticket.errors';
import { CannotReviewOwnTicketHhRequestError, CannotReviewTicketHhRequestError, TicketHhRequestNotFoundError } from '../../domain/errors/ticket-hh-request.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { buildTicketHourEntry } from '../support/build-ticket-hour-entry';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ApproveTicketHhRequestCommand {
  readonly ticketId: string;
  readonly requestId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Aprueba la solicitud aprobando el `hour_entries` pendiente ya creado junto
 * con ella (`request.hourEntryId`, ver `CreateTicketHhRequestUseCase`) — así
 * la misma fila que ya era visible en la cola general de "Aprobaciones de
 * horas" pasa a `approved`, en vez de crearse una nueva. Si la solicitud es de
 * antes de este cambio y todavía no tiene `hourEntryId` (backfill pendiente),
 * se cae al comportamiento anterior: crear el `hour_entries` ya aprobado en
 * este mismo paso. Ver docs/DECISION-M5-TICKETS.md.
 */
@Injectable()
export class ApproveTicketHhRequestUseCase implements UseCase<ApproveTicketHhRequestCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: ApproveTicketHhRequestCommand): Promise<Result<void, ApplicationError>> {
    const { ticketId, requestId, actor, actorRole } = command;

    const request = await this.requests.findById(requestId);
    if (!request || request.ticketId !== ticketId) return err(new TicketHhRequestNotFoundError(requestId));

    const ticket = await this.tickets.findById(ticketId);
    if (!ticket || ticket.isDeleted) return err(new TicketNotFoundError(ticketId));

    if (request.userId === actor.userId) return err(new CannotReviewOwnTicketHhRequestError());
    if (actorRole !== 'admin' && actorRole !== 'pmo') {
      const isApprover = await this.projects.isProjectApprover(request.projectId, actor.userId, request.userId);
      if (!isApprover) return err(new CannotReviewTicketHhRequestError());
    }

    const now = this.clock.now();
    const existingEntry = request.hourEntryId ? await this.hourEntries.findById(request.hourEntryId) : null;

    let entry: HourEntry;
    if (existingEntry) {
      const approvedEntry = existingEntry.approve(actor.userId, now);
      if (approvedEntry.isErr()) return err(approvedEntry.error);
      entry = existingEntry;
    } else {
      const entryCreated = buildTicketHourEntry({
        ids: this.ids,
        userId: request.userId,
        projectId: request.projectId,
        hours: request.hours,
        date: request.date,
        note: request.note,
        isOvertime: request.isOvertime,
        ticketDisplayId: ticket.legacyId ?? ticket.id,
        ownerRequiresApproval: false,
        now,
      });
      if (entryCreated.isErr()) return err(entryCreated.error);
      entry = entryCreated.value;
    }

    const approved = request.approve(actor.userId, entry.id, now);
    if (approved.isErr()) return err(approved.error);

    await this.hourEntries.save(entry);
    await this.requests.save(request);

    ticket.recordUsedHours(ticket.usedHours + request.hours, now);
    await this.tickets.save(ticket);

    await this.history.append({
      ticketId,
      eventType: 'ticket_hh_approved',
      description: `Se aprobaron ${request.hours} HH del ${request.date.toISOString().slice(0, 10)}.`,
      actorUserId: actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'status_change',
      entityType: 'ticket_hh_request',
      entityId: request.id,
      changes: { status: { before: 'pending', after: 'approved' } },
    });

    return ok(undefined);
  }
}
