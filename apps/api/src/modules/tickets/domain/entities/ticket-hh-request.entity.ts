import { AggregateRoot, createDomainEvent, err, ok, type Result } from '@kora/core';
import {
  InvalidTicketHhRequestHoursError,
  TicketHhRequestNotPendingError,
  TicketHhRequestRejectionReasonRequiredError,
} from '../errors/ticket-hh-request.errors';

export type TicketHhRequestStatus = 'pending' | 'approved' | 'rejected';

export interface TicketHhRequestProps {
  ticketId: string;
  projectId: string;
  userId: string;
  date: Date;
  hours: number;
  note: string | null;
  status: TicketHhRequestStatus;
  rejectionReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  hourEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTicketHhRequestProps {
  readonly id: string;
  readonly ticketId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly date: Date;
  readonly hours: number;
  readonly note?: string | null;
  readonly now: Date;
}

export interface RestoreTicketHhRequestProps extends TicketHhRequestProps {
  readonly id: string;
}

/**
 * Solicitud de horas desde un ticket — raíz de agregado propia (no un valor
 * dentro de `Ticket`), porque su ciclo de vida (pendiente → aprobada/rechazada)
 * es independiente y la aprueba/rechaza alguien distinto de quien la crea.
 * Ver docs/DECISION-M5-TICKETS.md.
 */
export class TicketHhRequest extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: TicketHhRequestProps,
  ) {
    super(id);
  }

  static create(props: CreateTicketHhRequestProps): Result<TicketHhRequest, InvalidTicketHhRequestHoursError> {
    if (!(props.hours > 0) || props.hours > 24) return err(new InvalidTicketHhRequestHoursError());

    const request = new TicketHhRequest(props.id, {
      ticketId: props.ticketId,
      projectId: props.projectId,
      userId: props.userId,
      date: props.date,
      hours: props.hours,
      note: props.note?.trim() || null,
      status: 'pending',
      rejectionReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
      hourEntryId: null,
      createdAt: props.now,
      updatedAt: props.now,
    });

    request.addDomainEvent(
      createDomainEvent('ticket_hh_request.created', props.id, { ticketId: props.ticketId, userId: props.userId }, props.now),
    );
    return ok(request);
  }

  static restore(props: RestoreTicketHhRequestProps): TicketHhRequest {
    const { id, ...rest } = props;
    return new TicketHhRequest(id, { ...rest });
  }

  get ticketId(): string {
    return this.props.ticketId;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get date(): Date {
    return this.props.date;
  }

  get hours(): number {
    return this.props.hours;
  }

  get note(): string | null {
    return this.props.note;
  }

  get status(): TicketHhRequestStatus {
    return this.props.status;
  }

  approve(reviewerUserId: string, hourEntryId: string, now: Date): Result<void, TicketHhRequestNotPendingError> {
    if (this.props.status !== 'pending') return err(new TicketHhRequestNotPendingError());

    this.props.status = 'approved';
    this.props.rejectionReason = null;
    this.props.reviewedByUserId = reviewerUserId;
    this.props.reviewedAt = now;
    this.props.hourEntryId = hourEntryId;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('ticket_hh_request.approved', this.id, { reviewerUserId }, now));
    return ok(undefined);
  }

  reject(
    reviewerUserId: string,
    reason: string,
    now: Date,
  ): Result<void, TicketHhRequestNotPendingError | TicketHhRequestRejectionReasonRequiredError> {
    if (this.props.status !== 'pending') return err(new TicketHhRequestNotPendingError());
    if (!reason.trim()) return err(new TicketHhRequestRejectionReasonRequiredError());

    this.props.status = 'rejected';
    this.props.rejectionReason = reason.trim();
    this.props.reviewedByUserId = reviewerUserId;
    this.props.reviewedAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('ticket_hh_request.rejected', this.id, { reviewerUserId }, now));
    return ok(undefined);
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): TicketHhRequestProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
