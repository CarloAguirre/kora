import { AggregateRoot, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { TicketPriority, TicketServiceType, TicketStatus } from '@kora/contracts';
import { InvalidTicketTitleError, TicketAlreadyClosedError } from '../errors/ticket.errors';

export interface TicketProps {
  legacyId: string | null;
  clientId: string | null;
  projectId: string | null;
  developmentProjectId: string | null;
  title: string;
  serviceType: TicketServiceType | null;
  description: string | null;
  evidenceUrl: string | null;
  assigneeUserId: string | null;
  priority: TicketPriority | null;
  estimatedHours: number | null;
  status: TicketStatus;
  resolution: string | null;
  resolvedAt: Date | null;
  usedHours: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateTicketProps {
  readonly id: string;
  readonly clientId?: string | null;
  readonly projectId?: string | null;
  readonly developmentProjectId?: string | null;
  readonly title: string;
  readonly serviceType?: TicketServiceType | null;
  readonly description?: string | null;
  readonly priority?: TicketPriority | null;
  readonly assigneeUserId?: string | null;
  readonly estimatedHours?: number | null;
  readonly now: Date;
}

export interface RestoreTicketProps extends TicketProps {
  readonly id: string;
}

/**
 * Ticket de soporte: raíz del agregado de M5.
 *
 * El flujo de estados (`Pendiente → En Proceso → En Pruebas → Terminado →
 * Cerrado`) no es estrictamente unidireccional en la v1 — `ticket_reopened`
 * es un tipo de evento real y frecuente (150 ocurrencias). Por eso
 * `changeStatus` no rechaza retrocesos: solo informa si el cambio fue un
 * avance o un reabierto, para que el caso de uso registre el evento correcto
 * en la bitácora.
 */
export class Ticket extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: TicketProps,
  ) {
    super(id);
  }

  static create(props: CreateTicketProps): Result<Ticket, InvalidTicketTitleError> {
    const title = props.title.trim();
    if (!title) return err(new InvalidTicketTitleError('El título del ticket no puede estar vacío.'));

    const ticket = new Ticket(props.id, {
      legacyId: null,
      clientId: props.clientId ?? null,
      projectId: props.projectId ?? null,
      developmentProjectId: props.developmentProjectId ?? null,
      title,
      serviceType: props.serviceType ?? null,
      description: props.description?.trim() || null,
      evidenceUrl: null,
      assigneeUserId: props.assigneeUserId ?? null,
      priority: props.priority ?? null,
      estimatedHours: props.estimatedHours ?? null,
      status: 'pending',
      resolution: null,
      resolvedAt: null,
      usedHours: 0,
      createdAt: props.now,
      updatedAt: props.now,
      deletedAt: null,
    });

    ticket.addDomainEvent(createDomainEvent('ticket.created', props.id, { title }, props.now));
    return ok(ticket);
  }

  static restore(props: RestoreTicketProps): Ticket {
    const { id, ...rest } = props;
    return new Ticket(id, { ...rest });
  }

  get status(): TicketStatus {
    return this.props.status;
  }

  get projectId(): string | null {
    return this.props.projectId;
  }

  get assigneeUserId(): string | null {
    return this.props.assigneeUserId;
  }

  get serviceType(): TicketServiceType | null {
    return this.props.serviceType;
  }

  get resolution(): string | null {
    return this.props.resolution;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  get legacyId(): string | null {
    return this.props.legacyId;
  }

  get usedHours(): number {
    return this.props.usedHours;
  }

  /** `true` si el cambio de estado es un reabierto (retrocede desde Terminado/Cerrado). */
  changeStatus(status: TicketStatus, now: Date): { previous: TicketStatus; reopened: boolean } {
    const previous = this.props.status;
    const wasClosed = previous === 'done' || previous === 'closed';
    const reopened = wasClosed && status !== 'done' && status !== 'closed';

    this.props.status = status;
    if ((status === 'done' || status === 'closed') && !this.props.resolvedAt) {
      this.props.resolvedAt = now;
    }
    if (reopened) this.props.resolvedAt = null;

    this.touch(now);
    this.addDomainEvent(createDomainEvent('ticket.status_changed', this.id, { from: previous, to: status }, now));
    return { previous, reopened };
  }

  updateDetails(
    data: Partial<
      Pick<
        TicketProps,
        'title' | 'developmentProjectId' | 'serviceType' | 'description' | 'priority' | 'assigneeUserId' | 'estimatedHours' | 'resolution'
      >
    >,
    now: Date,
  ): Result<void, InvalidTicketTitleError> {
    if (data.title !== undefined) {
      const title = data.title.trim();
      if (!title) return err(new InvalidTicketTitleError('El título del ticket no puede estar vacío.'));
      data.title = title;
    }

    Object.assign(this.props, data);
    this.touch(now);
    return ok(undefined);
  }

  recordUsedHours(hours: number, now: Date): void {
    this.props.usedHours = hours;
    this.touch(now);
  }

  softDelete(now: Date): Result<void, TicketAlreadyClosedError> {
    if (this.isDeleted) return err(new TicketAlreadyClosedError());
    this.props.deletedAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('ticket.deleted', this.id, {}, now));
    return ok(undefined);
  }

  linkLegacyId(legacyId: string | null): void {
    this.props.legacyId = legacyId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): TicketProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
