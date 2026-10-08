import type { TransactionContext } from '@kora/core';
import type { PlannedForecastWeek } from '../services/forecast-planner';

/** Qué generó las filas: un tramo del Roadmap o una tarea. */
export type ForecastSource = { readonly kind: 'segment'; readonly segmentId: string } | { readonly kind: 'task'; readonly taskId: string };

export interface ForecastSourceTarget {
  readonly source: ForecastSource;
  readonly projectId: string;
  readonly clientId: string | null;
}

/** Un cambio que la sincronización hizo en una fila — para dejarlo en el historial del Forecast. */
export interface ForecastSyncChange {
  readonly action: 'create' | 'update' | 'delete';
  readonly assignmentId: string;
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  /** HH que vale la fila después del cambio (`null` si se eliminó). */
  readonly assignedHours: number | null;
  /** El cálculo cambió sobre una fila que el líder había ajustado. */
  readonly becameStale: boolean;
}

export interface ForecastMemberLabel {
  readonly teamMemberId: string;
  readonly fullName: string;
  readonly teamId: string;
  readonly teamName: string;
  /** Capacidad semanal comprometida — base del cálculo de un tramo. */
  readonly weeklyHours: number;
}

/** Fase de un proyecto vivo — lo que recorre "Recalcular desde proyectos". */
export interface ForecastSourceModuleRef {
  readonly projectId: string;
  readonly clientId: string | null;
  readonly projectName: string;
  readonly moduleId: string;
}

/**
 * Las filas de Forecast que calculan los tramos y las tareas. Puerto propio del módulo de proyectos:
 * `ForecastModule` ya importa `ProjectsModule`, así que no se puede depender de él sin crear un ciclo.
 */
export interface ForecastSourceStore {
  /** Feriados (días no laborables) entre `start` y `end`, inclusive. */
  listNonWorkingDates(start: Date, end: Date, context?: TransactionContext): Promise<Date[]>;

  /**
   * Pertenencia activa de la persona — la del equipo `preferredTeamId` si está en él, si no la primera
   * que tenga. `null` si no está activa en ningún equipo.
   */
  findActiveTeamMemberId(userId: string, preferredTeamId: string | null, context?: TransactionContext): Promise<string | null>;

  /**
   * Deja las filas de `target` iguales a `weeks`, sin pisar los ajustes del líder:
   * - fila sin ajuste → sus HH siguen al cálculo (se crea, actualiza o elimina);
   * - fila ajustada → solo se actualiza `calculatedHours`; si cambió, queda desfasada (`isStale`).
   *   Si el cálculo ya no la produce, queda con `calculatedHours = 0`, nunca se elimina.
   */
  syncSource(
    target: ForecastSourceTarget,
    weeks: readonly PlannedForecastWeek[],
    now: Date,
    context?: TransactionContext,
  ): Promise<ForecastSyncChange[]>;

  listMemberLabels(teamMemberIds: readonly string[], context?: TransactionContext): Promise<ForecastMemberLabel[]>;

  /** Fases de los proyectos no eliminados en borrador, activos o detenidos. */
  listLiveModules(context?: TransactionContext): Promise<ForecastSourceModuleRef[]>;
}

export const FORECAST_SOURCE_STORE = Symbol('ForecastSourceStore');
