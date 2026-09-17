import { AggregateRoot, assignDefined, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { ProjectPhase, ProjectPriority, ProjectSalesStage, ProjectStatus, ProjectType } from '@kora/contracts';
import {
  SalesStageNotAllowedForSupportError,
  SalesStageRequiredForDevelopmentError,
} from '../errors/project.errors';

export interface ProjectProps {
  name: string;
  clientId: string | null;
  primaryContactId: string | null;
  type: ProjectType;
  salesStage: ProjectSalesStage | null;
  status: ProjectStatus;
  phase: ProjectPhase | null;
  priority: ProjectPriority | null;
  leaderUserId: string | null;
  developerUserId: string | null;
  commercialManagerUserId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  estimatedDeliveryDate: Date | null;
  soldHours: number;
  usedHours: number;
  expectedProgress: number | null;
  actualProgress: number | null;
  supportPlanDescription: string | null;
  supportHours: number;
  overtimeRateUf: number;
  allowsOvertime: boolean;
  quotationLink: string | null;
  contractLink: string | null;
  additionalLinks: string | null;
  onHoldReason: string | null;
  stopsClock: boolean;
  scopeNotes: string | null;
  deliveryDocumentation: string | null;
  demoLink: string | null;
  testEnvironmentLink: string | null;
  figmaLink: string | null;
  documentationLink: string | null;
  impactBeforeHours: number | null;
  impactBeforePeople: string | null;
  impactBeforeDuration: string | null;
  impactBeforeModality: string | null;
  impactAfterHours: number | null;
  impactAfterPeople: string | null;
  impactAfterDuration: string | null;
  impactAfterModality: string | null;
  qaTestingStartDate: Date | null;
  qaTestingEndDate: Date | null;
  qaEvaluatedModule: string | null;
  qaPlannedTests: number | null;
  qaExecutedTests: number | null;
  qaFailedTests: number | null;
  /** "Avance del periodo" del portal cliente — narrativa de logros declarada por el líder, igual criterio que impacto/QA. */
  periodReportDate: Date | null;
  periodReportAchievements: string[] | null;
  /** Hito 0 quedó pausado esperando que Gerencia active el proyecto a mano — ver `MarkProjectPaymentMilestonePaidUseCase`. */
  pendingManagementApproval: boolean;
  legacyId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateProjectProps {
  readonly id: string;
  readonly name: string;
  readonly clientId?: string | null;
  readonly type: ProjectType;
  readonly salesStage?: ProjectSalesStage | null;
  readonly priority?: ProjectPriority | null;
  readonly leaderUserId?: string | null;
  readonly developerUserId?: string | null;
  readonly commercialManagerUserId?: string | null;
  readonly startDate?: Date | null;
  readonly estimatedDeliveryDate?: Date | null;
  readonly soldHours?: number;
  readonly supportPlanDescription?: string | null;
  readonly supportHours?: number;
  readonly quotationLink?: string | null;
  readonly contractLink?: string | null;
  readonly additionalLinks?: string | null;
  readonly phase?: ProjectPhase | null;
  /** Subconjunto de estados con sentido al crear (draft/active/on_hold) — ver `createProjectSchema`. */
  readonly status?: ProjectStatus | null;
  readonly now: Date;
}

export interface RestoreProjectProps extends ProjectProps {
  readonly id: string;
}

/**
 * Proyecto: raíz del agregado central del sistema.
 *
 * `type`, `salesStage`, `status` y `phase` son cuatro campos independientes
 * — ver docs/DECISION-M3-ESTADOS.md. La única regla que cruza dos de ellos y
 * por eso vive aquí: `salesStage` solo tiene sentido si `type === 'development'`.
 */
export class Project extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: ProjectProps,
  ) {
    super(id);
  }

  static create(
    props: CreateProjectProps,
  ): Result<Project, SalesStageRequiredForDevelopmentError | SalesStageNotAllowedForSupportError> {
    const salesStageCheck = Project.validateSalesStage(props.type, props.salesStage ?? null);
    if (salesStageCheck.isErr()) return err(salesStageCheck.error);

    const project = new Project(props.id, {
      name: props.name.trim(),
      clientId: props.clientId ?? null,
      primaryContactId: null,
      type: props.type,
      salesStage: props.type === 'development' ? (props.salesStage ?? null) : null,
      status: props.status ?? 'active',
      phase: props.phase ?? null,
      priority: props.priority ?? null,
      leaderUserId: props.leaderUserId ?? null,
      developerUserId: props.developerUserId ?? null,
      commercialManagerUserId: props.commercialManagerUserId ?? null,
      startDate: props.startDate ?? null,
      endDate: null,
      estimatedDeliveryDate: props.estimatedDeliveryDate ?? null,
      soldHours: props.soldHours ?? 0,
      usedHours: 0,
      expectedProgress: null,
      actualProgress: null,
      supportPlanDescription: props.supportPlanDescription ?? null,
      supportHours: props.supportHours ?? 0,
      overtimeRateUf: 0,
      allowsOvertime: false,
      quotationLink: props.quotationLink ?? null,
      contractLink: props.contractLink ?? null,
      additionalLinks: props.additionalLinks ?? null,
      onHoldReason: null,
      stopsClock: false,
      scopeNotes: null,
      deliveryDocumentation: null,
      demoLink: null,
      testEnvironmentLink: null,
      figmaLink: null,
      documentationLink: null,
      impactBeforeHours: null,
      impactBeforePeople: null,
      impactBeforeDuration: null,
      impactBeforeModality: null,
      impactAfterHours: null,
      impactAfterPeople: null,
      impactAfterDuration: null,
      impactAfterModality: null,
      qaTestingStartDate: null,
      qaTestingEndDate: null,
      qaEvaluatedModule: null,
      qaPlannedTests: null,
      qaExecutedTests: null,
      qaFailedTests: null,
      periodReportDate: null,
      periodReportAchievements: null,
      pendingManagementApproval: false,
      legacyId: null,
      createdAt: props.now,
      updatedAt: props.now,
      deletedAt: null,
    });

    project.addDomainEvent(
      createDomainEvent('project.created', props.id, { name: props.name, type: props.type }, props.now),
    );
    return ok(project);
  }

  static restore(props: RestoreProjectProps): Project {
    const { id, ...rest } = props;
    return new Project(id, { ...rest });
  }

  private static validateSalesStage(
    type: ProjectType,
    salesStage: ProjectSalesStage | null,
  ): Result<void, SalesStageRequiredForDevelopmentError | SalesStageNotAllowedForSupportError> {
    if (type === 'development' && !salesStage) return err(new SalesStageRequiredForDevelopmentError());
    if (type === 'support' && salesStage) return err(new SalesStageNotAllowedForSupportError());
    return ok(undefined);
  }

  get name(): string {
    return this.props.name;
  }

  get clientId(): string | null {
    return this.props.clientId;
  }

  get type(): ProjectType {
    return this.props.type;
  }

  get salesStage(): ProjectSalesStage | null {
    return this.props.salesStage;
  }

  get status(): ProjectStatus {
    return this.props.status;
  }

  get phase(): ProjectPhase | null {
    return this.props.phase;
  }

  get leaderUserId(): string | null {
    return this.props.leaderUserId;
  }

  get allowsOvertime(): boolean {
    return this.props.allowsOvertime;
  }

  get pendingManagementApproval(): boolean {
    return this.props.pendingManagementApproval;
  }

  get legacyId(): number | null {
    return this.props.legacyId;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  updateDetails(
    data: Partial<
      Pick<
        ProjectProps,
        | 'name'
        | 'clientId'
        | 'salesStage'
        | 'phase'
        | 'priority'
        | 'leaderUserId'
        | 'developerUserId'
        | 'commercialManagerUserId'
        | 'startDate'
        | 'endDate'
        | 'estimatedDeliveryDate'
        | 'soldHours'
        | 'expectedProgress'
        | 'actualProgress'
        | 'supportPlanDescription'
        | 'supportHours'
        | 'allowsOvertime'
        | 'quotationLink'
        | 'contractLink'
        | 'onHoldReason'
        | 'stopsClock'
        | 'scopeNotes'
        | 'deliveryDocumentation'
        | 'demoLink'
        | 'testEnvironmentLink'
        | 'figmaLink'
        | 'documentationLink'
        | 'impactBeforeHours'
        | 'impactBeforePeople'
        | 'impactBeforeDuration'
        | 'impactBeforeModality'
        | 'impactAfterHours'
        | 'impactAfterPeople'
        | 'impactAfterDuration'
        | 'impactAfterModality'
        | 'qaTestingStartDate'
        | 'qaTestingEndDate'
        | 'qaEvaluatedModule'
        | 'qaPlannedTests'
        | 'qaExecutedTests'
        | 'qaFailedTests'
        | 'periodReportDate'
        | 'periodReportAchievements'
      >
    >,
    now: Date,
  ): Result<void, SalesStageNotAllowedForSupportError> {
    if (data.salesStage !== undefined) {
      const check = Project.validateSalesStage(this.props.type, data.salesStage);
      if (check.isErr()) return err(check.error);
    }
    if (data.name !== undefined) data.name = data.name.trim();
    if (this.props.type === 'support') data.phase = null;

    assignDefined(this.props, data);
    this.touch(now);
    return ok(undefined);
  }

  changeStatus(status: ProjectStatus, now: Date): void {
    if (this.props.status === status) return;
    const previous = this.props.status;
    this.props.status = status;
    if (status === 'finished' && !this.props.endDate) this.props.endDate = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('project.status_changed', this.id, { from: previous, to: status }, now));
  }

  /** Hito 0 activado automáticamente al pagar el primer tramo (interruptor global en `true`) — ver `MarkProjectPaymentMilestonePaidUseCase`. */
  activateFromFirstPayment(now: Date): void {
    this.changeStatus('active', now);
  }

  /** Hito 0 disparado con el interruptor global en `false` (o pausado a mano) — queda a la espera de que Gerencia lo active. */
  pauseForManagementApproval(now: Date): void {
    if (this.props.pendingManagementApproval) return;
    this.props.pendingManagementApproval = true;
    this.touch(now);
  }

  /** Gerencia resuelve un Hito 0 pausado — activa el proyecto y limpia la marca. */
  resolveManagementApproval(now: Date): void {
    this.props.pendingManagementApproval = false;
    this.changeStatus('active', now);
  }

  recordUsedHours(hours: number, now: Date): void {
    this.props.usedHours = hours;
    this.touch(now);
  }

  setPrimaryContact(contactId: string | null, now: Date): void {
    if (this.props.primaryContactId === contactId) return;
    this.props.primaryContactId = contactId;
    this.touch(now);
  }

  softDelete(now: Date): void {
    if (this.isDeleted) return;
    this.props.deletedAt = now;
    this.touch(now);
    this.addDomainEvent(createDomainEvent('project.deleted', this.id, {}, now));
  }

  linkLegacyId(legacyId: number | null): void {
    this.props.legacyId = legacyId;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): ProjectProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
