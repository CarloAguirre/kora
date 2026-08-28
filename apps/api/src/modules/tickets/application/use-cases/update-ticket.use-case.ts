import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { UpdateTicketInput } from '@kora/contracts';
import { ReferencedProjectNotFoundError, TicketNotFoundError } from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateTicketCommand {
  readonly ticketId: string;
  readonly data: UpdateTicketInput;
  readonly actor: ActorContext;
}

@Injectable()
export class UpdateTicketUseCase implements UseCase<UpdateTicketCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateTicketCommand): Promise<Result<void, ApplicationError>> {
    const { ticketId, data, actor } = command;
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket || ticket.isDeleted) return err(new TicketNotFoundError(ticketId));

    if (data.developmentProjectId) {
      const project = await this.projects.findById(data.developmentProjectId);
      if (!project) return err(new ReferencedProjectNotFoundError(data.developmentProjectId));
    }

    const before = ticket.toSnapshot();
    const now = this.clock.now();
    const result = ticket.updateDetails(
      {
        title: data.title,
        developmentProjectId: data.developmentProjectId,
        serviceType: data.serviceType,
        description: data.description,
        priority: data.priority,
        assigneeUserId: data.assigneeUserId,
        estimatedHours: data.estimatedHours,
        resolution: data.resolution,
      },
      now,
    );
    if (result.isErr()) return err(result.error);

    await this.tickets.save(ticket);
    const after = ticket.toSnapshot();

    if (data.assigneeUserId !== undefined && after.assigneeUserId !== before.assigneeUserId) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'assignee_changed',
        description: 'Se cambió el responsable del ticket.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }
    if (data.resolution !== undefined && after.resolution !== before.resolution) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'solution_changed',
        description: 'Se actualizó la solución del ticket.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }
    if (data.priority !== undefined && after.priority !== before.priority) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'priority_changed',
        description: 'Se actualizó la criticidad del ticket.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }
    if (data.description !== undefined && after.description !== before.description) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'description_changed',
        description: 'Se actualizó la descripción del ticket.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }
    if (data.developmentProjectId !== undefined && after.developmentProjectId !== before.developmentProjectId) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'development_project_changed',
        description: 'Se actualizó el proyecto de desarrollo vinculado.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }
    if (data.estimatedHours !== undefined && after.estimatedHours !== before.estimatedHours) {
      await this.history.append({
        ticketId: ticket.id,
        eventType: 'estimated_hours_changed',
        description: 'Se actualizaron las HH estimadas del ticket.',
        actorUserId: actor.userId,
        occurredAt: now,
      });
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'ticket',
      entityId: ticket.id,
    });

    return ok(undefined);
  }
}
