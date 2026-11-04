/** Un equipo asignado a un proyecto que lidera la persona como Líder PM. */
export interface LedProjectTeamRow {
  readonly projectId: string;
  readonly projectSlug: string;
  readonly projectName: string;
  readonly clientName: string | null;
  readonly salesStage: 'prospect' | 'quoted' | 'approved' | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly teamName: string;
  /** HH asignadas a este equipo en el proyecto (`project_teams.assigned_hours`). */
  readonly assignedHours: number | null;
  /**
   * El equipo ya registró horas aprobadas o por aprobar en el proyecto —
   * mismo alcance que el Reporte de equipo: miembros activos más su líder.
   */
  readonly teamHasHours: boolean;
}

/** Lectura para "datos por completar" de la campanita: cruza proyectos, equipos y horas. */
export interface LedProjectReader {
  /**
   * Equipos de los proyectos en curso (sin borrados, cancelados ni finalizados)
   * cuyo Líder PM es `userId`. Los finalizados quedan fuera a propósito: el
   * Reporte de equipo los sigue marcando y se pueden pedir con "Pedir datos",
   * pero un recordatorio diario por proyectos cerrados sería ruido.
   */
  listTeamsOfLedProjects(userId: string): Promise<LedProjectTeamRow[]>;
}

export const LED_PROJECT_READER = Symbol('LedProjectReader');
