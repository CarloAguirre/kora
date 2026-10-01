import type { TransactionContext } from '@kora/core';
import type { ForecastAssignment } from '../entities/forecast-assignment.entity';

/** Fila resuelta con los nombres ya unidos — evita puertos aparte solo para nombres. */
export interface ForecastAssignmentRecord {
  readonly id: string;
  readonly teamMemberId: string;
  readonly memberFullName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly type: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly comments: string;
  readonly assignedHours: number;
  /** Tramo del Roadmap que generó la fila — `null` si se cargó a mano. */
  readonly segmentId: string | null;
  readonly segmentName: string | null;
  readonly segmentModuleName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fila cruda usada por la vista de capacidad (agregación en el caso de uso, no en SQL). */
export interface ForecastAssignmentRawRow {
  readonly teamMemberId: string;
  readonly type: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly comments: string;
  readonly assignedHours: number;
}

export interface ForecastAssignmentRepository {
  findById(id: string, context?: TransactionContext): Promise<ForecastAssignment | null>;
  findByLegacyId(legacyId: number, context?: TransactionContext): Promise<ForecastAssignment | null>;

  /** Asignaciones de un equipo en un período, con nombres resueltos — para la vista editable. */
  listForTeamAndPeriod(
    teamId: string,
    periodStart: Date,
    periodEnd: Date,
    context?: TransactionContext,
  ): Promise<ForecastAssignmentRecord[]>;

  /** Filas crudas de todos los miembros planificables en un período — para la vista de capacidad. */
  listRawForPeriod(periodStart: Date, periodEnd: Date, context?: TransactionContext): Promise<ForecastAssignmentRawRow[]>;

  save(assignment: ForecastAssignment, context?: TransactionContext): Promise<void>;
  delete(id: string, context?: TransactionContext): Promise<void>;
}

export const FORECAST_ASSIGNMENT_REPOSITORY = Symbol('ForecastAssignmentRepository');
