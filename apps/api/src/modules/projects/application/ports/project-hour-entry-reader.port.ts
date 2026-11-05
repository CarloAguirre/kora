/**
 * Lectura mínima de horas que necesita el módulo de proyectos — no importa
 * `HoursModule` (evitaría el ciclo Projects↔Hours, ya que `HoursModule`
 * importa `ProjectsModule`): mismo patrón que `ProjectUserReader`, un puerto
 * propio implementado contra `@kora/db` directamente.
 */
export interface CollaboratorProjectEventRecord {
  readonly id: string;
  readonly date: Date;
  readonly createdAt: Date;
  readonly userName: string;
  readonly moduleName: string | null;
  readonly activity: string;
  readonly description: string;
  readonly hours: number;
  readonly hasBlocker: boolean;
  readonly blockerDescription: string | null;
}
export interface ProjectHourEntryReader {
  weeklyHoursByProjectForUser(
    userId: string, projectIds: readonly string[], from: Date, through: Date,
  ): Promise<readonly { projectId: string; hours: number }[]>;
  approvedProjectEvents(
    projectId: string, limit: number,
  ): Promise<{ entries: readonly CollaboratorProjectEventRecord[]; truncated: boolean }>;

  /** Fecha de la hora aprobada más reciente del proyecto — el "actualizado al" de la tarjeta de horas. `null` si no tiene ninguna. */
  maxApprovedEntryDateForProject(projectId: string): Promise<Date | null>;
  /**
   * Suma de horas aprobadas con fecha ANTERIOR a `beforeDate` (exclusivo) —
   * alimenta la fase "Prospecto/Cotización" (ver `GetProjectUseCase`):
   * horas registradas antes del Hito 0 quedan en esa fase, no en las de
   * ejecución. `beforeDate` es la fecha del Hito 0 (`project.hito0At`).
   */
  sumApprovedHoursBeforeDateForProject(projectId: string, beforeDate: Date): Promise<number>;
}

export const PROJECT_HOUR_ENTRY_READER = Symbol('ProjectHourEntryReader');
