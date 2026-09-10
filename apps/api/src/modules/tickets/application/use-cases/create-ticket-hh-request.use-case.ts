import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { CreateTicketHhRequestInput, RoleCode } from '@kora/contracts';
import { TicketHhRequest } from '../../domain/entities/ticket-hh-request.entity';
import { TicketNotFoundError } from '../../domain/errors/ticket.errors';
import {
  CannotSubmitTicketHhRequestError,
  TicketHhRequestDailyCapExceededError,
  TicketOvertimeNotAllowedError,
  TicketProjectMissingForHhRequestError,
} from '../../domain/errors/ticket-hh-request.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { buildApprovedHourEntry } from '../support/build-approved-hour-entry';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

/** Tope diario salvo horas extra — mismo criterio que `DailyEntryForm` (Horas). */
const DAILY_CAP_HOURS = 8;

export interface CreateTicketHhRequestCommand {
  readonly ticketId: string;
  readonly data: CreateTicketHhRequestInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Puede solicitar horas en un ticket: admin/PMO, el responsable del ticket, o
 * quien tenga autoridad sobre el proyecto (líder del proyecto o de un equipo
 * asignado a él) — mismo criterio amplio que `rls_can_submit_ticket_hh_request`
 * en la v1, ver docs/DECISION-M5-TICKETS.md.
 *
 * Quien tiene autoridad sobre el proyecto (admin/PMO o `isProjectApprover`) ve
 * su propia solicitud aprobada al instante — igual que en la v1, donde el
 * líder del proyecto de soporte registra HH ya aprobadas directamente
 * (`createApprovedTicketHHRegistration`) en vez de quedar pendiente de
 * revisión. Cualquier otro responsable sigue quedando `pending`.
 */
@Injectable()
export class CreateTicketHhRequestUseCase implements UseCase<CreateTicketHhRequestCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateTicketHhRequestCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { ticketId, data, actor, actorRole } = command;

    const ticket = await this.tickets.findById(ticketId);
    if (!ticket || ticket.isDeleted) return err(new TicketNotFoundError(ticketId));
    if (!ticket.projectId) return err(new TicketProjectMissingForHhRequestError());
    if (data.isOvertime && !ticket.allowsOvertime) return err(new TicketOvertimeNotAllowedError());

    const isAdminTier = actorRole === 'admin' || actorRole === 'pmo';
    const isAssignee = ticket.assigneeUserId === actor.userId;
    // Autoridad sobre SU PROPIA carga: ¿el actor sería quien decide sus
    // propias horas en este proyecto? (líder de su propio equipo, o líder de
    // proyecto si no tiene uno) — mismo criterio EXCLUYENTE que Horas.
    const isApprover = isAdminTier ? true : await this.projects.isProjectApprover(ticket.projectId, actor.userId, actor.userId);
    if (!isAdminTier && !isAssignee && !isApprover) return err(new CannotSubmitTicketHhRequestError());

    const requestDate = new Date(`${data.date}T00:00:00.000Z`);
    if (!data.isOvertime) {
      const [pendingTicketHours, otherHours] = await Promise.all([
        this.requests.sumHoursForUserAndDate(actor.userId, requestDate),
        this.hourEntries.sumHoursForUserAndDate(actor.userId, requestDate),
      ]);
      const totalHours = pendingTicketHours + otherHours + data.hours;
      if (totalHours > DAILY_CAP_HOURS) return err(new TicketHhRequestDailyCapExceededError(totalHours));
    }

    const now = this.clock.now();
    const created = TicketHhRequest.create({
      id: this.ids.generate(),
      ticketId,
      projectId: ticket.projectId,
      userId: actor.userId,
      date: requestDate,
      hours: data.hours,
      note: data.note ?? null,
      isOvertime: data.isOvertime,
      now,
    });
    if (created.isErr()) return err(created.error);
    const request = created.value;

    if (isApprover) {
      const entryCreated = buildApprovedHourEntry({
        ids: this.ids,
        userId: actor.userId,
        projectId: ticket.projectId,
        hours: request.hours,
        date: request.date,
        note: request.note,
        isOvertime: request.isOvertime,
        ticketDisplayId: ticket.legacyId ?? ticket.id,
        now,
      });
      if (entryCreated.isErr()) return err(entryCreated.error);
      const entry = entryCreated.value;

      const approved = request.approve(actor.userId, entry.id, now);
      if (approved.isErr()) return err(approved.error);

      await this.hourEntries.save(entry);
      await this.requests.save(request);

      ticket.recordUsedHours(ticket.usedHours + request.hours, now);
      await this.tickets.save(ticket);

      await this.history.append({
        ticketId,
        eventType: 'ticket_hh_direct_approved',
        description: `Se registraron ${data.hours} HH aprobadas directamente para el ${data.date}.`,
        actorUserId: actor.userId,
        occurredAt: now,
      });
    } else {
      await this.requests.save(request);
      await this.history.append({
        ticketId,
        eventType: 'ticket_hh_requested',
        description: `Se solicitaron ${data.hours} HH para el ${data.date}.`,
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'ticket_hh_request',
      entityId: request.id,
      metadata: { ticketId, hours: data.hours, date: data.date, directlyApproved: isApprover },
    });

    return ok({ id: request.id });
  }
}
