import { AggregateRoot, assignDefined, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { SupportPlanCurrency, SupportPlanScope, SupportPlanStatus, SupportPlanType, SupportSurplusPolicy } from '@kora/contracts';
import { InvalidSupportPlanDateRangeError, SupportPlanAlreadyClosedError } from '../errors/support-plan.errors';

export interface SupportPlanProps {
  legacyId: number | null;
  clientId: string;
  slug: string;
  /** Proyecto "contenedor" legado — `null` en contratos creados desde la v2 (ver `support_plan_projects`). */
  projectId: string | null;
  planType: SupportPlanType;
  scope: SupportPlanScope;
  surplusPolicy: SupportSurplusPolicy | null;
  status: SupportPlanStatus;
  startDate: Date;
  endDate: Date | null;
  contractedHours: number;
  /** El nombre de estos dos campos quedó heredado de cuando solo existía UF — la moneda real la da `currency`. */
  planValueUf: number;
  extraHourValueUf: number;
  currency: SupportPlanCurrency;
  name: string | null;
  leaderUserId: string | null;
  primaryContactId: string | null;
  quotationLink: string | null;
  contractLink: string | null;
  additionalLinks: string | null;
  dueDayOfMonth: number | null;
  targetHoursCritical: number | null;
  targetHoursHigh: number | null;
  targetHoursMedium: number | null;
  targetHoursLow: number | null;
  closedAt: Date | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupportPlanProps {
  readonly id: string;
  readonly clientId: string;
  readonly slug: string;
  /** Solo para un contrato de soporte creado junto con su propio proyecto (ver `CreateSupportProjectUseCase`) — enlace directo, distinto de `support_plan_projects` (que consolida proyectos de desarrollo YA existentes). */
  readonly projectId?: string | null;
  readonly scope: SupportPlanScope;
  readonly planType: SupportPlanType;
  readonly surplusPolicy?: SupportSurplusPolicy | null;
  readonly startDate: Date;
  readonly endDate?: Date | null;
  readonly contractedHours: number;
  readonly planValueUf: number;
  readonly extraHourValueUf: number;
  readonly currency?: SupportPlanCurrency;
  readonly name?: string | null;
  readonly leaderUserId?: string | null;
  readonly primaryContactId?: string | null;
  readonly quotationLink?: string | null;
  readonly contractLink?: string | null;
  readonly additionalLinks?: string | null;
  readonly dueDayOfMonth?: number | null;
  readonly targetHoursCritical?: number | null;
  readonly targetHoursHigh?: number | null;
  readonly targetHoursMedium?: number | null;
  readonly targetHoursLow?: number | null;
  readonly now: Date;
}

export type UpdatableSupportPlanFields = Partial<
  Pick<
    SupportPlanProps,
    | 'scope'
    | 'planType'
    | 'surplusPolicy'
    | 'startDate'
    | 'endDate'
    | 'contractedHours'
    | 'planValueUf'
    | 'extraHourValueUf'
    | 'currency'
    | 'name'
    | 'leaderUserId'
    | 'primaryContactId'
    | 'quotationLink'
    | 'contractLink'
    | 'additionalLinks'
    | 'dueDayOfMonth'
    | 'targetHoursCritical'
    | 'targetHoursHigh'
    | 'targetHoursMedium'
    | 'targetHoursLow'
  >
>;

export interface RestoreSupportPlanProps extends SupportPlanProps {
  readonly id: string;
}

/**
 * Contrato de soporte de un cliente. `scope` distingue si cubre un solo
 * proyecto de desarrollo terminado (`single`) o varios compartiendo una sola
 * bolsa de horas y una sola facturación (`consolidated`) — el enlace real a
 * los proyectos vive en `support_plan_projects`, fuera de este agregado: qué
 * proyectos cubre es una decisión que el caso de uso orquesta junto con la
 * validación de elegibilidad (deben ser de desarrollo, terminados, del mismo
 * cliente), no una invariante que este agregado pueda verificar por sí solo.
 */
export class SupportPlan extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: SupportPlanProps,
  ) {
    super(id);
  }

  static create(props: CreateSupportPlanProps): Result<SupportPlan, InvalidSupportPlanDateRangeError> {
    const endDate = props.endDate ?? null;
    if (endDate && endDate.getTime() < props.startDate.getTime()) {
      return err(new InvalidSupportPlanDateRangeError());
    }

    const plan = new SupportPlan(props.id, {
      legacyId: null,
      clientId: props.clientId,
      slug: props.slug,
      projectId: props.projectId ?? null,
      planType: props.planType,
      scope: props.scope,
      surplusPolicy: props.surplusPolicy ?? null,
      status: 'active',
      startDate: props.startDate,
      endDate,
      contractedHours: props.contractedHours,
      planValueUf: props.planValueUf,
      extraHourValueUf: props.extraHourValueUf,
      currency: props.currency ?? 'UF',
      name: props.name?.trim() || null,
      leaderUserId: props.leaderUserId ?? null,
      primaryContactId: props.primaryContactId ?? null,
      quotationLink: props.quotationLink?.trim() || null,
      contractLink: props.contractLink?.trim() || null,
      additionalLinks: props.additionalLinks?.trim() || null,
      dueDayOfMonth: props.dueDayOfMonth ?? null,
      targetHoursCritical: props.targetHoursCritical ?? null,
      targetHoursHigh: props.targetHoursHigh ?? null,
      targetHoursMedium: props.targetHoursMedium ?? null,
      targetHoursLow: props.targetHoursLow ?? null,
      closedAt: null,
      closeReason: null,
      createdAt: props.now,
      updatedAt: props.now,
    });

    plan.addDomainEvent(createDomainEvent('support_plan.created', props.id, { clientId: props.clientId, scope: props.scope }, props.now));
    return ok(plan);
  }

  static restore(props: RestoreSupportPlanProps): SupportPlan {
    const { id, ...rest } = props;
    return new SupportPlan(id, { ...rest });
  }

  get clientId(): string {
    return this.props.clientId;
  }

  get slug(): string {
    return this.props.slug;
  }

  /** `null` salvo en contratos legados migrados por el ETL — ver el comentario del schema. */
  get projectId(): string | null {
    return this.props.projectId;
  }

  get scope(): SupportPlanScope {
    return this.props.scope;
  }

  get planType(): SupportPlanType {
    return this.props.planType;
  }

  get surplusPolicy(): SupportSurplusPolicy | null {
    return this.props.surplusPolicy;
  }

  get status(): SupportPlanStatus {
    return this.props.status;
  }

  get startDate(): Date {
    return this.props.startDate;
  }

  get endDate(): Date | null {
    return this.props.endDate;
  }

  get contractedHours(): number {
    return this.props.contractedHours;
  }

  get planValueUf(): number {
    return this.props.planValueUf;
  }

  get extraHourValueUf(): number {
    return this.props.extraHourValueUf;
  }

  get currency(): SupportPlanCurrency {
    return this.props.currency;
  }

  get name(): string | null {
    return this.props.name;
  }

  update(patch: UpdatableSupportPlanFields, now: Date): Result<void, InvalidSupportPlanDateRangeError> {
    const nextStart = patch.startDate ?? this.props.startDate;
    const nextEnd = patch.endDate !== undefined ? patch.endDate : this.props.endDate;
    if (nextEnd && nextEnd.getTime() < nextStart.getTime()) {
      return err(new InvalidSupportPlanDateRangeError());
    }

    if (patch.name !== undefined) patch.name = patch.name?.trim() || null;
    if (patch.quotationLink !== undefined) patch.quotationLink = patch.quotationLink?.trim() || null;
    if (patch.contractLink !== undefined) patch.contractLink = patch.contractLink?.trim() || null;
    if (patch.additionalLinks !== undefined) patch.additionalLinks = patch.additionalLinks?.trim() || null;

    assignDefined(this.props, patch);
    this.touch(now);
    return ok(undefined);
  }

  close(closedAt: Date, closeReason: string, now: Date): Result<void, SupportPlanAlreadyClosedError> {
    if (this.props.status !== 'active') return err(new SupportPlanAlreadyClosedError());

    this.props.status = 'ended';
    this.props.closedAt = closedAt;
    this.props.closeReason = closeReason.trim();
    this.touch(now);
    this.addDomainEvent(createDomainEvent('support_plan.closed', this.id, { closeReason }, now));
    return ok(undefined);
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): SupportPlanProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}
