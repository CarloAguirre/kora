/**
 * Datos de los proyectos que acompañan al Forecast sin sumar HH: entregas, tareas cubiertas por un
 * tramo, HH asignadas por proyecto y horas registradas. Ver docs/DECISION-M6-FORECAST.md,
 * "Forecast calculado".
 */

export interface ForecastDeliverySignal {
  readonly id: string;
  readonly name: string;
  readonly projectName: string;
  readonly moduleName: string;
  readonly date: Date;
  readonly assigneeUserId: string;
  readonly teamId: string | null;
}

/** Tarea que no suma en el Forecast porque su responsable ya tiene un tramo del mismo módulo esos días. */
export interface ForecastContainedTaskSignal {
  readonly id: string;
  readonly name: string;
  readonly projectName: string;
  readonly moduleName: string;
  readonly startDate: Date;
  readonly date: Date;
  readonly estimatedHours: number;
  /** Pertenencia de la persona en el tramo que la cubre. */
  readonly teamMemberId: string;
}

export interface ForecastProjectHoursSignal {
  readonly teamMemberId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly hours: number;
}

export interface ForecastLoggedHoursSignal {
  readonly userId: string;
  readonly hours: number;
}

export interface ForecastPlanningSignalsReader {
  /** Entregas con responsable y fecha estimada entre `start` y `end`, de proyectos no eliminados. */
  listDeliveries(start: Date, end: Date): Promise<ForecastDeliverySignal[]>;
  /** Tareas que se cruzan con `start`–`end` y que, en ese rango, cubre un tramo de su responsable. */
  listContainedTasks(start: Date, end: Date): Promise<ForecastContainedTaskSignal[]>;
  /** HH asignadas a cada persona en el equipo de cada proyecto vivo (`project_team_members`). */
  listAssignedProjectHours(): Promise<ForecastProjectHoursSignal[]>;
  /** HH que el Forecast ya tiene por persona y proyecto, sumando todas las semanas. */
  listPlannedProjectHours(): Promise<ForecastProjectHoursSignal[]>;
  /** HH registradas (pendientes o aprobadas) entre `start` y `end`, por persona. */
  listLoggedHours(start: Date, end: Date): Promise<ForecastLoggedHoursSignal[]>;
}

export const FORECAST_PLANNING_SIGNALS_READER = Symbol('ForecastPlanningSignalsReader');
