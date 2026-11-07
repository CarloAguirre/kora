/** Proyección aprobada → calendario operativo. La aplicación no conoce SQL ni Drizzle. */
export interface ApprovedProjectCalendar {
  /**
   * Materializa una sola vez el cronograma comercial transferido de un proyecto
   * iniciado, sin modificar bloques editados manualmente.
   * Devuelve true solo si se insertaron bloques en esta ejecución.
   */
  ensure(projectId: string): Promise<boolean>;
}
export const APPROVED_PROJECT_CALENDAR = Symbol('ApprovedProjectCalendar');
