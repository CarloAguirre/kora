import { AggregateRoot, assignDefined, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { ForecastAssignmentSource, ForecastAssignmentType } from '@kora/contracts';
import {
  ForecastCalculatedRowLockedError,
  ForecastRowNotCalculatedError,
  InvalidForecastHoursError,
  InvalidForecastPeriodError,
} from '../errors/forecast.errors';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ForecastAssignmentProps {
  legacyId: number | null;
  teamMemberId: string;
  periodStart: Date;
  periodEnd: Date;
  type: ForecastAssignmentType;
  projectId: string | null;
  clientId: string | null;
  comments: string;
  assignedHours: number;
  /** `manual` la cargó el líder; `segment`/`task` la calcula Kora — ver `ForecastSourceSyncService`. */
  source: ForecastAssignmentSource;
  /** Lo que dice el cálculo — `null` en las manuales. */
  calculatedHours: number | null;
  adjustedAt: Date | null;
  adjustedByUserId: string | null;
  isStale: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateForecastAssignmentProps {
  readonly id: string;
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly type: ForecastAssignmentType;
  readonly projectId?: string | null;
  readonly clientId?: string | null;
  readonly comments?: string | null;
  readonly assignedHours: number;
  readonly now: Date;
}

export interface RestoreForecastAssignmentProps extends ForecastAssignmentProps {
  readonly id: string;
}

/**
 * Asignación de forecast: raíz del agregado de M6.
 *
 * Sin máquina de estados — a diferencia de tickets u horas, una asignación
 * de forecast solo tiene alta, edición y baja. El período siempre es una
 * semana laboral completa (lunes a viernes); el contrato ya lo valida, pero
 * se revalida aquí porque `create`/`restore` también los usa el ETL, que no
 * pasa por el contrato HTTP.
 */
export class ForecastAssignment extends AggregateRoot<string> {
  private constructor(
    id: string,
    private props: ForecastAssignmentProps,
  ) {
    super(id);
  }

  static create(
    props: CreateForecastAssignmentProps,
  ): Result<ForecastAssignment, InvalidForecastPeriodError | InvalidForecastHoursError> {
    const periodError = validatePeriod(props.periodStart, props.periodEnd);
    if (periodError) return err(periodError);
    if (props.assignedHours < 0) {
      return err(new InvalidForecastHoursError('Las HH asignadas no pueden ser negativas.'));
    }

    const assignment = new ForecastAssignment(props.id, {
      legacyId: null,
      teamMemberId: props.teamMemberId,
      periodStart: props.periodStart,
      periodEnd: props.periodEnd,
      type: props.type,
      projectId: props.projectId ?? null,
      clientId: props.clientId ?? null,
      comments: props.comments?.trim() || '',
      assignedHours: props.assignedHours,
      source: 'manual',
      calculatedHours: null,
      adjustedAt: null,
      adjustedByUserId: null,
      isStale: false,
      createdAt: props.now,
      updatedAt: props.now,
    });

    assignment.addDomainEvent(
      createDomainEvent('forecast_assignment.created', props.id, { teamMemberId: props.teamMemberId }, props.now),
    );
    return ok(assignment);
  }

  static restore(props: RestoreForecastAssignmentProps): ForecastAssignment {
    const { id, ...rest } = props;
    return new ForecastAssignment(id, { ...rest });
  }

  get teamMemberId(): string {
    return this.props.teamMemberId;
  }

  get periodStart(): Date {
    return this.props.periodStart;
  }

  get periodEnd(): Date {
    return this.props.periodEnd;
  }

  get type(): ForecastAssignmentType {
    return this.props.type;
  }

  get projectId(): string | null {
    return this.props.projectId;
  }

  get clientId(): string | null {
    return this.props.clientId;
  }

  get comments(): string {
    return this.props.comments;
  }

  get assignedHours(): number {
    return this.props.assignedHours;
  }

  get legacyId(): number | null {
    return this.props.legacyId;
  }

  get source(): ForecastAssignmentSource {
    return this.props.source;
  }

  /** La calcula Kora desde un tramo o una tarea (no la cargó el líder a mano). */
  get isCalculated(): boolean {
    return this.props.source !== 'manual';
  }

  get calculatedHours(): number | null {
    return this.props.calculatedHours;
  }

  get isAdjusted(): boolean {
    return this.props.adjustedAt !== null;
  }

  get isStale(): boolean {
    return this.props.isStale;
  }

  /**
   * En una fila calculada solo cambian HH y comentarios. Cambiar sus HH la deja ajustada (el cálculo
   * deja de tocarla); volver a poner exactamente lo calculado equivale a "Volver al cálculo".
   */
  updateDetails(
    data: Partial<Pick<ForecastAssignmentProps, 'type' | 'projectId' | 'clientId' | 'comments' | 'assignedHours'>>,
    now: Date,
    actorUserId: string | null = null,
  ): Result<void, InvalidForecastHoursError | ForecastCalculatedRowLockedError> {
    if (data.assignedHours !== undefined && data.assignedHours < 0) {
      return err(new InvalidForecastHoursError('Las HH asignadas no pueden ser negativas.'));
    }
    if (data.comments !== undefined) data.comments = data.comments.trim();

    if (this.isCalculated) {
      const changesReference =
        (data.type !== undefined && data.type !== this.props.type) ||
        (data.projectId !== undefined && data.projectId !== this.props.projectId) ||
        (data.clientId !== undefined && data.clientId !== this.props.clientId);
      if (changesReference) return err(new ForecastCalculatedRowLockedError());

      if (data.assignedHours !== undefined && data.assignedHours !== this.props.assignedHours) {
        if (data.assignedHours === this.props.calculatedHours) {
          this.clearAdjustment();
        } else {
          this.props.adjustedAt = now;
          this.props.adjustedByUserId = actorUserId;
          this.props.isStale = false;
        }
      }
      this.props.comments = data.comments ?? this.props.comments;
      this.props.assignedHours = data.assignedHours ?? this.props.assignedHours;
    } else {
      assignDefined(this.props, data);
    }
    this.touch(now);
    this.addDomainEvent(createDomainEvent('forecast_assignment.updated', this.id, {}, now));
    return ok(undefined);
  }

  /** "Volver al cálculo": las HH vuelven a seguir al proyecto. */
  resetToCalculation(now: Date): Result<void, ForecastRowNotCalculatedError> {
    if (!this.isCalculated) return err(new ForecastRowNotCalculatedError());
    this.props.assignedHours = this.props.calculatedHours ?? 0;
    this.clearAdjustment();
    this.touch(now);
    this.addDomainEvent(createDomainEvent('forecast_assignment.updated', this.id, {}, now));
    return ok(undefined);
  }

  /** "Mantener mi ajuste": el líder vio que el cálculo cambió y conserva su valor. */
  keepAdjustment(now: Date): void {
    if (!this.props.isStale) return;
    this.props.isStale = false;
    this.touch(now);
  }

  linkLegacyId(legacyId: number | null): void {
    this.props.legacyId = legacyId;
  }

  private clearAdjustment(): void {
    this.props.adjustedAt = null;
    this.props.adjustedByUserId = null;
    this.props.isStale = false;
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }

  toSnapshot(): ForecastAssignmentProps & { id: string } {
    return { id: this.id, ...this.props };
  }
}

function validatePeriod(periodStart: Date, periodEnd: Date): InvalidForecastPeriodError | null {
  if (periodStart.getUTCDay() !== 1) {
    return new InvalidForecastPeriodError('El período debe iniciar un lunes.');
  }
  const spanDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY);
  if (spanDays !== 4) {
    return new InvalidForecastPeriodError('El período debe ser una semana completa (lunes a viernes).');
  }
  return null;
}
