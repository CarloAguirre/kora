import { AggregateRoot, assignDefined, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { HourEntryStatus } from '@kora/contracts';
import { PROJECT_REQUIRING_ASSIGNMENTS } from '@kora/contracts';
import {
  DesignatedApproverNotAllowedError,
  DesignatedApproverRequiredError,
  HourEntryNotEditableError,
  InvalidHourEntryHoursError,
  InvalidHourEntryStatusTransitionError,
  ProjectNotAllowedForAssignmentError,
  ProjectRequiredForAssignmentError,
  RejectionReasonRequiredError,
} from '../errors/hour-entry.errors';

export interface HourEntryProps {
  userId: string;
  projectId: string | null;
  assignment: string | null;
  category: string;
  description: string;
  hours: number;
  date: Date;
  isOvertime: boolean;
  projectStageAtEntry: string | null;
  status: HourEntryStatus;
  rejectionReason: string | null;
  decisionUserId: string | null;
  decisionAt: Date | null;
  designatedApproverUserId: string | null;
  legacyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHourEntryProps {
  readonly id: string;
  readonly userId: string;
  readonly projectId?: string | null;
  readonly assignment: string;
  readonly category?: string;
  readonly description?: string;
  readonly hours: number;
  readonly date: Date;
  readonly isOvertime?: boolean;
  readonly projectStageAtEntry?: string | null;
  readonly designatedApproverUserId?: string | null;
  /** Solo un colaborador necesita aprobación — ver docs/DECISION-M4-HORAS.md. */
  readonly ownerRequiresApproval: boolean;
  readonly now: Date;
}

export type CreateHourEntryError =
  | InvalidHourEntryHoursError
  | ProjectRequiredForAssignmentError
  | ProjectNotAllowedForAssignmentError
  | DesignatedApproverRequiredError
  | DesignatedApproverNotAllowedError;

export interface RestoreHourEntryProps extends HourEntryProps {
  readonly id: string;
}

/**
 * Registro de horas: raíz del agregado de M4.
 *
 * La v1 decide `estado` y la exigencia de aprobador designado en el cliente
 * (`RegistroHHModal.tsx`), confiado a lo que RLS permite insertar — RLS
 * autoriza la fila, pero no fuerza qué `estado` lleva. Aquí esa decisión es
 * del dominio, evaluada en el servidor a partir del rol real del dueño, no
 * de lo que el cliente proponga.
 */
export class HourEntry extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: HourEntryProps,
  ) {
    super(id);
  }

  static create(props: CreateHourEntryProps): Result<HourEntry, CreateHourEntryError> {
    if (!(props.hours > 0) || props.hours > 24) {
      return err(new InvalidHourEntryHoursError('Las horas deben estar entre 0 y 24.'));
    }

    const requiresProject = PROJECT_REQUIRING_ASSIGNMENTS.has(props.assignment);
    const projectId = props.projectId ?? null;
    if (requiresProject && !projectId) return err(new ProjectRequiredForAssignmentError());
    if (!requiresProject && projectId) return err(new ProjectNotAllowedForAssignmentError());

    const designatedApproverUserId = props.designatedApproverUserId ?? null;
    if (projectId && designatedApproverUserId) return err(new DesignatedApproverNotAllowedError());
    if (!projectId && props.ownerRequiresApproval && !designatedApproverUserId) {
      return err(new DesignatedApproverRequiredError());
    }

    const status: HourEntryStatus = props.ownerRequiresApproval ? 'pending' : 'approved';

    const entry = new HourEntry(props.id, {
      userId: props.userId,
      projectId,
      assignment: props.assignment,
      category: (props.category ?? '').trim(),
      description: (props.description ?? '').trim(),
      hours: props.hours,
      date: props.date,
      isOvertime: props.isOvertime ?? false,
      projectStageAtEntry: props.projectStageAtEntry ?? null,
      status,
      rejectionReason: null,
      decisionUserId: null,
      decisionAt: null,
      designatedApproverUserId: projectId ? null : designatedApproverUserId,
      legacyId: null,
      createdAt: props.now,
      updatedAt: props.now,
    });

    entry.addDomainEvent(
      createDomainEvent('hour_entry.created', props.id, { userId: props.userId, status }, props.now),
    );
    return ok(entry);
  }

  static restore(props: RestoreHourEntryProps): HourEntry {
    const { id, ...rest } = props;
    return new HourEntry(id, { ...rest });
  }

  get userId(): string {
    return this.props.userId;
  }

  get projectId(): string | null {
    return this.props.projectId;
  }

  get status(): HourEntryStatus {
    return this.props.status;
  }

  get designatedApproverUserId(): string | null {
    return this.props.designatedApproverUserId;
  }

  get hours(): number {
    return this.props.hours;
  }

  get legacyId(): string | null {
    return this.props.legacyId;
  }

  approve(actorUserId: string, now: Date): Result<void, InvalidHourEntryStatusTransitionError> {
    if (this.props.status !== 'pending') return err(new InvalidHourEntryStatusTransitionError(this.props.status));
    this.props.status = 'approved';
    this.props.rejectionReason = null;
    this.props.decisionUserId = actorUserId;
    this.props.decisionAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('hour_entry.approved', this.id, { actorUserId }, now));
    return ok(undefined);
  }

  reject(
    actorUserId: string,
    reason: string,
    now: Date,
  ): Result<void, InvalidHourEntryStatusTransitionError | RejectionReasonRequiredError> {
    if (this.props.status !== 'pending') return err(new InvalidHourEntryStatusTransitionError(this.props.status));
    if (!reason.trim()) return err(new RejectionReasonRequiredError());

    this.props.status = 'rejected';
    this.props.rejectionReason = reason.trim();
    this.props.decisionUserId = actorUserId;
    this.props.decisionAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('hour_entry.rejected', this.id, { actorUserId }, now));
    return ok(undefined);
  }

  /**
   * Solo el dueño (o un admin, decidido fuera del dominio) puede editar, y
   * solo mientras esté pendiente o rechazado — un registro aprobado ya
   * pudo haber afectado el consumo del proyecto.
   */
  updateDetails(
    data: Partial<
      Pick<
        HourEntryProps,
        'assignment' | 'projectId' | 'category' | 'description' | 'hours' | 'date' | 'isOvertime' | 'designatedApproverUserId'
      >
    >,
    ownerRequiresApproval: boolean,
    now: Date,
  ): Result<void, CreateHourEntryError | HourEntryNotEditableError> {
    if (this.props.status === 'approved') return err(new HourEntryNotEditableError());

    if (data.hours !== undefined && (!(data.hours > 0) || data.hours > 24)) {
      return err(new InvalidHourEntryHoursError('Las horas deben estar entre 0 y 24.'));
    }

    const assignment = data.assignment ?? this.props.assignment ?? '';
    const projectId = data.projectId !== undefined ? data.projectId : this.props.projectId;
    const requiresProject = PROJECT_REQUIRING_ASSIGNMENTS.has(assignment);
    if (requiresProject && !projectId) return err(new ProjectRequiredForAssignmentError());
    if (!requiresProject && projectId) return err(new ProjectNotAllowedForAssignmentError());

    const designatedApproverUserId =
      data.designatedApproverUserId !== undefined ? data.designatedApproverUserId : this.props.designatedApproverUserId;
    if (projectId && designatedApproverUserId) return err(new DesignatedApproverNotAllowedError());
    if (!projectId && ownerRequiresApproval && !designatedApproverUserId) {
      return err(new DesignatedApproverRequiredError());
    }

    assignDefined(this.props, data);
    this.props.designatedApproverUserId = projectId ? null : designatedApproverUserId;

    const wasRejected = this.props.status === 'rejected';
    this.props.status = ownerRequiresApproval ? 'pending' : 'approved';
    if (wasRejected) {
      this.props.rejectionReason = null;
      this.props.decisionUserId = null;
      this.props.decisionAt = null;
    }

    this.touch(now);
    return ok(undefined);
  }

  linkLegacyId(legacyId: string | null): void {
    this.props.legacyId = legacyId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): HourEntryProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
