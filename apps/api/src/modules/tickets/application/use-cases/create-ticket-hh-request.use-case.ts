import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { CreateTicketHhRequestInput, RoleCode } from '@kora/contracts';
import { TicketHhRequest } from '../../domain/entities/ticket-hh-request.entity';
import { TicketNotFoundError } from '../../domain/errors/ticket.errors';
import { CannotSubmitTicketHhRequestError, TicketProjectMissingForHhRequestError } from '../../domain/errors/ticket-hh-request.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { buildTicketHourEntry } from '../support/build-ticket-hour-entry';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

/** Jornada diaria — sobre este total, las horas de una solicitud de ticket se registran como horas extra. */
const DAILY_CAP_HOURS = 8;

interface HoursTranche {
  readonly hours: number;
  readonly isOvertime: boolean;
}

const roundHours = (value: number) => Math.round(value * 100) / 100;
const sumHours = (tranches: readonly HoursTranche[]) => roundHours(tranches.reduce((sum, tranche) => sum + tranche.hours, 0));

/**
 * Divide las horas pedidas en el tramo que aún cabe en la jornada de
 * `DAILY_CAP_HOURS` (normales) y el resto (horas extra). Devuelve uno o dos
 * tramos, nunca uno de 0h.
 */
export function splitByDailyCap(requestedHours: number, regularHoursForDate: number): HoursTranche[] {
  const regularHours = roundHours(Math.min(requestedHours, Math.max(0, DAILY_CAP_HOURS - regularHoursForDate)));
  const overtimeHours = roundHours(requestedHours - regularHours);
  const tranches: HoursTranche[] = [];
  if (regularHours > 0) tranches.push({ hours: regularHours, isOvertime: false });
  if (overtimeHours > 0) tranches.push({ hours: overtimeHours, isOvertime: true });
  return tranches;
}

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
 * En soporte no hay que autorizar horas extra: si con la solicitud el día
 * supera las 8h normales, el excedente se guarda como una segunda solicitud
 * marcada como horas extra (cada tramo con su propio `hour_entries`), así el
 * colaborador y su líder ven cuántas horas extra se hicieron.
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

    const isAdminTier = actorRole === 'admin' || actorRole === 'pmo';
    const isAssignee = ticket.assigneeUserId === actor.userId;
    // Autoridad sobre SU PROPIA carga: ¿el actor sería quien decide sus
    // propias horas en este proyecto? (líder de su propio equipo, o líder de
    // proyecto si no tiene uno) — mismo criterio EXCLUYENTE que Horas.
    const isApprover = isAdminTier ? true : await this.projects.isProjectApprover(ticket.projectId, actor.userId, actor.userId);
    if (!isAdminTier && !isAssignee && !isApprover) return err(new CannotSubmitTicketHhRequestError());

    const requestDate = new Date(`${data.date}T00:00:00.000Z`);
    // Solo las horas normales ya registradas ese día (cualquier ticket/proceso)
    // consumen la jornada — incluye las solicitudes pendientes de ticket, que
    // viven como `hour_entries` pendientes desde que se crean.
    const regularHoursForDate = await this.hourEntries.sumRegularHoursForUserAndDate(actor.userId, requestDate);
    const tranches = splitByDailyCap(data.hours, regularHoursForDate);

    const now = this.clock.now();
    const created: TicketHhRequest[] = [];
    for (const tranche of tranches) {
      const requestCreated = TicketHhRequest.create({
        id: this.ids.generate(),
        ticketId,
        projectId: ticket.projectId,
        userId: actor.userId,
        date: requestDate,
        hours: tranche.hours,
        note: data.note ?? null,
        isOvertime: tranche.isOvertime,
        now,
      });
      if (requestCreated.isErr()) return err(requestCreated.error);
      const request = requestCreated.value;

      // Autoaprobación (autoridad sobre el proyecto) o pendiente de revisión —
      // en ambos casos se crea de inmediato su `hour_entries` vinculado, para
      // que la pendiente aparezca desde ya en la cola general de
      // "Aprobaciones de horas" (no solo en el ticket).
      const entryCreated = buildTicketHourEntry({
        ids: this.ids,
        userId: actor.userId,
        projectId: ticket.projectId,
        hours: request.hours,
        date: request.date,
        note: request.note,
        isOvertime: request.isOvertime,
        ticketDisplayId: ticket.legacyId ?? ticket.id,
        ownerRequiresApproval: !isApprover,
        now,
      });
      if (entryCreated.isErr()) return err(entryCreated.error);
      const entry = entryCreated.value;

      if (isApprover) {
        const approved = request.approve(actor.userId, entry.id, now);
        if (approved.isErr()) return err(approved.error);
      } else {
        request.linkHourEntry(entry.id);
      }

      await this.hourEntries.save(entry);
      await this.requests.save(request);
      created.push(request);
    }

    const overtimeHours = sumHours(tranches.filter((tranche) => tranche.isOvertime));
    const overtimeNote = overtimeHours > 0 ? ` (${overtimeHours} HH como horas extra)` : '';

    if (isApprover) {
      ticket.recordUsedHours(ticket.usedHours + data.hours, now);
      await this.tickets.save(ticket);
    }

    await this.history.append({
      ticketId,
      eventType: isApprover ? 'ticket_hh_direct_approved' : 'ticket_hh_requested',
      description: isApprover
        ? `Se registraron ${data.hours} HH aprobadas directamente para el ${data.date}${overtimeNote}.`
        : `Se solicitaron ${data.hours} HH para el ${data.date}${overtimeNote}.`,
      actorUserId: actor.userId,
      occurredAt: now,
    });

    for (const request of created) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'create',
        entityType: 'ticket_hh_request',
        entityId: request.id,
        metadata: { ticketId, hours: request.hours, date: data.date, isOvertime: request.isOvertime, directlyApproved: isApprover },
      });
    }

    return ok({ id: created[0]!.id });
  }
}
