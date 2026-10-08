/** HH que un tramo o una tarea le cargaría a una persona en una semana (lunes a viernes). */
export interface PlannedLoadWeek {
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly assignedHours: number;
}

/**
 * El cálculo del Forecast desde tramos y tareas. Lo implementa el módulo de proyectos, dueño de ese
 * cálculo (`ForecastSourceSyncService`).
 */
export interface ForecastSourceCalculator {
  /** "Recalcular desde proyectos": vuelve a calcular todos los tramos y tareas de los proyectos vivos. */
  recalculateAll(now: Date): Promise<{ segments: number; tasks: number }>;

  /** HH que cargaría un tramo con estos datos, sin guardar nada. */
  previewSegment(input: {
    readonly startDate: Date;
    readonly endDate: Date;
    readonly members: readonly { teamMemberId: string; dailyPercent: number | null }[];
  }): Promise<PlannedLoadWeek[]>;

  /** HH que cargaría una tarea con estos datos, sin guardar nada. */
  previewTask(input: {
    readonly moduleId: string;
    readonly teamId: string | null;
    readonly assigneeUserId: string;
    readonly startDate: Date;
    readonly date: Date;
    readonly estimatedHours: number;
  }): Promise<PlannedLoadWeek[]>;
}

export const FORECAST_SOURCE_CALCULATOR = Symbol('ForecastSourceCalculator');
