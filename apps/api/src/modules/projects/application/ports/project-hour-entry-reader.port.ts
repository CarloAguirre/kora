/**
 * Lectura mínima de horas que necesita el módulo de proyectos — no importa
 * `HoursModule` (evitaría el ciclo Projects↔Hours, ya que `HoursModule`
 * importa `ProjectsModule`): mismo patrón que `ProjectUserReader`, un puerto
 * propio implementado contra `@kora/db` directamente.
 */
export interface ProjectHourEntryReader {
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
