import { AggregateRoot, createDomainEvent, err, ok, type Result } from '@kora/core';
import type { ForecastAssignmentType } from '@kora/contracts';
import { InvalidForecastHoursError, InvalidForecastPeriodError } from '../errors/forecast.errors';

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

  updateDetails(
    data: Partial<Pick<ForecastAssignmentProps, 'type' | 'projectId' | 'clientId' | 'comments' | 'assignedHours'>>,
    now: Date,
  ): Result<void, InvalidForecastHoursError> {
    if (data.assignedHours !== undefined && data.assignedHours < 0) {
      return err(new InvalidForecastHoursError('Las HH asignadas no pueden ser negativas.'));
    }
    if (data.comments !== undefined) data.comments = data.comments.trim();

    Object.assign(this.props, data);
    this.touch(now);
    this.addDomainEvent(createDomainEvent('forecast_assignment.updated', this.id, {}, now));
    return ok(undefined);
  }

  linkLegacyId(legacyId: number | null): void {
    this.props.legacyId = legacyId;
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
