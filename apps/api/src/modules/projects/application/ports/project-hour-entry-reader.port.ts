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
  readonly status: 'approved' | 'pending';
}
export interface HistoricalPhaseZeroEntryRecord {
  id: string;
  userId: string;
  userName: string;
  date: Date;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  activity: string;
  description: string;
  taskName: string | null;
  teamId: string | null;
  hours: number;
}

export interface ProjectHourEntryReader {
  weeklyHoursByProjectForUser(
    userId: string, projectIds: readonly string[], from: Date, through: Date,
  ): Promise<readonly { projectId: string; hours: number }[]>;
  projectBitacoraEvents(
    projectId: string, limit: number,
  ): Promise<{ entries: readonly CollaboratorProjectEventRecord[]; truncated: boolean }>;

  /** Fecha de la hora aprobada más reciente del proyecto — el "actualizado al" de la tarjeta de horas. `null` si no tiene ninguna. */
  maxApprovedEntryDateForProject(projectId: string): Promise<Date | null>;
  /**
   * Suma de horas aprobadas con fecha ANTERIOR a `beforeDate` (exclusivo) —
   * alimenta la fase "Prospecto/Cotización" (ver `GetProjectUseCase`).
   * `beforeDate` es la fecha del Hito 0 oficial o, en un proyecto activo
   * heredado sin Hito 0, su fecha de inicio provisional. Las HH del día
   * del corte ya corresponden a ejecución. No altera filas de horas.
   */
  sumApprovedHoursBeforeDateForProject(projectId: string, beforeDate: Date): Promise<number>;
  /**
   * Foto del consumo anterior al traspaso inicial. No equivale al corte del Hito 0:
   * un proyecto que comenzó antes de cotizar también conserva esas HH en Fase 0.
   * En transferencias antiguas sin metadatos retorna hours=null (fallback legado).
   */
  phaseZeroSnapshotForProject(projectId: string): Promise<{
    transferred: boolean; hours: number | null; cutoffAt?: Date | null;
  }>;
  /** Entrada real hasta el momento del traspaso. Nunca se inventa una tarea. */
  phaseZeroEntriesForProject?(projectId: string, cutoffAt: Date | null, limit: number): Promise<{
    entries: HistoricalPhaseZeroEntryRecord[]; truncated: boolean;
  }>;
}

export const PROJECT_HOUR_ENTRY_READER = Symbol('ProjectHourEntryReader');
