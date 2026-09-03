import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { RejectTicketHhRequestInput, RoleCode } from '@kora/contracts';
import { CannotReviewOwnTicketHhRequestError, CannotReviewTicketHhRequestError, TicketHhRequestNotFoundError } from '../../domain/errors/ticket-hh-request.errors';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface RejectTicketHhRequestCommand {
  readonly ticketId: string;
  readonly requestId: string;
  readonly data: RejectTicketHhRequestInput;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

@Injectable()
export class RejectTicketHhRequestUseCase implements UseCase<RejectTicketHhRequestCommand, void, ApplicationError> {
  constructor(
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectTicketHhRequestCommand): Promise<Result<void, ApplicationError>> {
    const { ticketId, requestId, data, actor, actorRole } = command;

    const request = await this.requests.findById(requestId);
    if (!request || request.ticketId !== ticketId) return err(new TicketHhRequestNotFoundError(requestId));

    if (request.userId === actor.userId) return err(new CannotReviewOwnTicketHhRequestError());
    if (actorRole !== 'admin' && actorRole !== 'pmo') {
      const isApprover = await this.projects.isProjectApprover(request.projectId, actor.userId, request.userId);
      if (!isApprover) return err(new CannotReviewTicketHhRequestError());
    }

    const now = this.clock.now();
    const rejected = request.reject(actor.userId, data.reason, now);
    if (rejected.isErr()) return err(rejected.error);

    await this.requests.save(request);
    await this.history.append({
      ticketId,
      eventType: 'ticket_hh_rejected',
      description: `Se rechazó la solicitud de ${request.hours} HH: ${data.reason}`,
      actorUserId: actor.userId,
      occurredAt: now,
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'status_change',
      entityType: 'ticket_hh_request',
      entityId: request.id,
      changes: { status: { before: 'pending', after: 'rejected' } },
    });

    return ok(undefined);
  }
}
