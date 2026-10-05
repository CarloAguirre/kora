/**
 * Actividad de una persona sobre un proyecto — alimenta la "Última
 * actualización" del portal cliente (la última acción del líder/PM). Lee de
 * dos fuentes porque ninguna cubre todo por sí sola: `audit_log` registra los
 * cambios de ficha, fases, tareas, entregas y pagos, pero las entradas de
 * bitácora (`project_observations`) no pasan por auditoría.
 */
export interface ProjectActivityReader {
  /** Instante de la acción más reciente de `userId` sobre el proyecto. `null` si nunca hizo nada. */
  lastActivityAtByUser(projectId: string, userId: string): Promise<Date | null>;
}

export const PROJECT_ACTIVITY_READER = Symbol('ProjectActivityReader');
