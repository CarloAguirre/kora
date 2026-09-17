/**
 * Lectura mínima de horas que necesita el módulo de proyectos — no importa
 * `HoursModule` (evitaría el ciclo Projects↔Hours, ya que `HoursModule`
 * importa `ProjectsModule`): mismo patrón que `ProjectUserReader`, un puerto
 * propio implementado contra `@kora/db` directamente.
 */
export interface ProjectHourEntryReader {
  /** Fecha de la hora aprobada más reciente del proyecto — el "actualizado al" de la tarjeta de horas. `null` si no tiene ninguna. */
  maxApprovedEntryDateForProject(projectId: string): Promise<Date | null>;
}

export const PROJECT_HOUR_ENTRY_READER = Symbol('ProjectHourEntryReader');
