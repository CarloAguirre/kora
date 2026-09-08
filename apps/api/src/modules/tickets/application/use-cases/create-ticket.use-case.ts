import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, err, ok, type ApplicationError, type Clock, type IdGenerator, type Result } from '@kora/core';
import type { CreateTicketInput, RoleCode } from '@kora/contracts';
import { Ticket } from '../../domain/entities/ticket.entity';
import { NoUsableSupportPlanError, ReferencedClientNotFoundError, ReferencedProjectNotFoundError } from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { TICKET_CODE_GENERATOR, type TicketCodeGenerator } from '../ports/ticket-code-generator.port';
import { TICKET_USER_READER, type TicketUserReader } from '../ports/ticket-user-reader.port';
import { ensureAssignable } from '../services/ticket-assignee';
import { SupportPlanAvailabilityService } from '../services/support-plan-availability.service';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateTicketCommand {
  readonly data: CreateTicketInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Un colaborador solo puede abrir un ticket contra un proyecto con plan de
 * soporte activo y usable hoy (`soporte_has_active_usable_plan` en la v1).
 * Líderes, PMO y admin no tienen esa restricción — igual que en la v1, donde
 * el gate solo aplica al autoservicio.
 */
@Injectable()
export class CreateTicketUseCase implements UseCase<CreateTicketCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(TICKET_CODE_GENERATOR) private readonly codeGenerator: TicketCodeGenerator,
    @Inject(TICKET_USER_READER) private readonly users: TicketUserReader,
    private readonly supportPlanAvailability: SupportPlanAvailabilityService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateTicketCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor, actorRole } = command;
    const now = this.clock.now();

    if (data.clientId) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    const assignable = await ensureAssignable(data.assigneeUserId, this.users);
    if (assignable.isErr()) return err(assignable.error);

    if (data.projectId) {
      const project = await this.projects.findById(data.projectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.projectId));

      if (actorRole === 'collaborator') {
        const availability = await this.supportPlanAvailability.check(data.projectId, now);
        if (!availability.hasActiveUsablePlan) return err(new NoUsableSupportPlanError());
      }
    }

    const created = Ticket.create({
      id: this.ids.generate(),
      clientId: data.clientId,
      projectId: data.projectId,
      developmentProjectId: data.developmentProjectId,
      title: data.title,
      serviceType: data.serviceType,
      description: data.description,
      evidenceUrl: data.evidenceUrl,
      priority: data.priority,
      assigneeUserId: data.assigneeUserId,
      estimatedHours: data.estimatedHours,
      now,
    });
    if (created.isErr()) return err(created.error);
    const ticket = created.value;
    ticket.linkLegacyId(await this.codeGenerator.next());

    await this.tickets.save(ticket);
    await this.history.append({
      ticketId: ticket.id,
      eventType: 'ticket_created',
      description: `Ticket creado: "${data.title}".`,
      actorUserId: actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'ticket',
      entityId: ticket.id,
      metadata: { title: data.title },
    });

    return ok({ id: ticket.id });
  }
}
