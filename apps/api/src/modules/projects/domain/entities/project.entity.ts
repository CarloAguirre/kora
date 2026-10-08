import { AggregateRoot, assignDefined, createDomainEvent, err, ok, type Result } from '@kora/core';
import type {
  ProjectContractCurrency,
  ProjectHito0Source,
  ProjectPhase,
  ProjectPriority,
  ProjectSalesStage,
  ProjectStatus,
  ProjectType,
} from '@kora/contracts';
import {
  SalesStageNotAllowedForSupportError,
  SalesStageRequiredForDevelopmentError,
} from '../errors/project.errors';

export interface ProjectProps {
  name: string;
  slug: string;
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
  /** Monto total del contrato — base del % de cada tramo de pago. */
  contractAmount: number | null;
  /** Moneda de todos los tramos de pago del proyecto. */
  contractCurrency: ProjectContractCurrency;
  /** Hito 0 quedó pausado esperando que Gerencia active el proyecto a mano — ver `IssueProjectPaymentMilestoneInvoiceUseCase`. */
  pendingManagementApproval: boolean;
  /** Fecha del Hito 0 (kickoff) — editable por Gerencia/PMO. `null` si el proyecto nunca se activó. */
  hito0At: Date | null;
  /** Qué disparó el Hito 0 — `null` junto con `hito0At`. */
  hito0Source: ProjectHito0Source | null;
  /** Motivo/referencia del Hito 0 manual — obligatorio solo cuando `hito0Source === 'manual'`. */
  hito0Reason: string | null;
  legacyId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateProjectProps {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
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
  readonly contractAmount?: number | null;
  readonly contractCurrency?: ProjectContractCurrency;
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

    const salesStage = props.type === 'development' ? (props.salesStage ?? null) : null;
    /**
     * Sin `status` explícito: un proyecto de desarrollo arranca "No iniciado"
     * (`draft`) en cualquier etapa comercial — incluso Aprobado. Pasa a
     * "Activo" solo por Hito 0: automático al facturar el primer tramo o
     * manual por Gerencia/PMO con motivo (ver `activateFromHito0`). Soporte no
     * tiene etapa comercial, así que sigue arrancando activo, como siempre.
     */
    const defaultStatus = props.type === 'development' ? 'draft' : 'active';

    const project = new Project(props.id, {
      name: props.name.trim(),
      slug: props.slug,
      clientId: props.clientId ?? null,
      primaryContactId: null,
      type: props.type,
      salesStage,
      status: props.status ?? defaultStatus,
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
      contractAmount: props.contractAmount ?? null,
      contractCurrency: props.contractCurrency ?? 'UF',
      pendingManagementApproval: false,
      hito0At: null,
      hito0Source: null,
      hito0Reason: null,
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

  get slug(): string {
    return this.props.slug;
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

  get hito0At(): Date | null {
    return this.props.hito0At;
  }

  get hito0Source(): ProjectHito0Source | null {
    return this.props.hito0Source;
  }

  get hito0Reason(): string | null {
    return this.props.hito0Reason;
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
        | 'contractAmount'
        | 'contractCurrency'
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

  /**
   * Hito 0 (primera activación): deja registrada fecha/origen/motivo y pasa
   * a Activo — ver `IssueProjectPaymentMilestoneInvoiceUseCase` (automático,
   * al facturar el primer tramo) y `ChangeProjectStatusUseCase` (manual, sin
   * factura — `reason` obligatorio ahí, no acá). No usar para reactivar un
   * proyecto `on_hold`: eso no toca `hito0At` — ver `changeStatus`.
   */
  activateFromHito0(now: Date, source: ProjectHito0Source, reason: string | null): void {
    this.props.hito0At = now;
    this.props.hito0Source = source;
    this.props.hito0Reason = reason;
    this.props.pendingManagementApproval = false;
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
    if (!this.props.hito0At) {
      this.props.hito0At = now;
      this.props.hito0Source = 'auto_invoice';
    }
    this.changeStatus('active', now);
  }

  /** Gerencia/PMO corrige la fecha del Hito 0 ya registrado — no cambia `status` ni `source`/`reason`. */
  correctHito0Date(date: Date, now: Date): void {
    this.props.hito0At = date;
    this.touch(now);
  }

  recordUsedHours(hours: number, now: Date): void {
    this.props.usedHours = hours;
    this.touch(now);
  }

  /**
   * Caché del avance real calculado (`calculateProjectProgress`) — lo escribe solo
   * `ProjectProgressRecalculator` al cambiar fases o tareas; existe para poder ordenar el listado
   * por avance. Devuelve `false` si no cambió, para no tocar `updatedAt` en vano.
   */
  recordActualProgress(actualProgress: number | null, now: Date): boolean {
    if (this.props.actualProgress === actualProgress) return false;
    this.props.actualProgress = actualProgress;
    this.touch(now);
    return true;
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
