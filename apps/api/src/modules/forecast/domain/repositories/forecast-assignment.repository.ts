import type { TransactionContext } from '@kora/core';
import type { ForecastAssignmentSource } from '@kora/contracts';
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
  readonly source: ForecastAssignmentSource;
  /** Tramo del Roadmap que generó la fila (`source = 'segment'`). */
  readonly segmentId: string | null;
  readonly segmentName: string | null;
  readonly segmentModuleName: string | null;
  /** Tarea que generó la fila (`source = 'task'`). */
  readonly taskId: string | null;
  readonly taskName: string | null;
  readonly taskModuleName: string | null;
  readonly calculatedHours: number | null;
  readonly adjustedAt: Date | null;
  readonly adjustedByName: string | null;
  readonly isStale: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fila cruda usada por la vista de capacidad (agregación en el caso de uso, no en SQL). */
export interface ForecastAssignmentRawRow {
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly type: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly comments: string;
  readonly assignedHours: number;
  readonly source: ForecastAssignmentSource;
  readonly segmentId: string | null;
  readonly taskId: string | null;
  readonly isAdjusted: boolean;
  readonly isStale: boolean;
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

  /**
   * Filas crudas de las semanas que empiezan entre `firstMonday` y `lastMonday` (inclusive) — para la
   * vista de capacidad de una semana (`firstMonday = lastMonday`) o de varias.
   */
  listRawForWeeks(firstMonday: Date, lastMonday: Date, context?: TransactionContext): Promise<ForecastAssignmentRawRow[]>;

  save(assignment: ForecastAssignment, context?: TransactionContext): Promise<void>;
  delete(id: string, context?: TransactionContext): Promise<void>;
}

export const FORECAST_ASSIGNMENT_REPOSITORY = Symbol('ForecastAssignmentRepository');
