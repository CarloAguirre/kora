/**
 * Lectura del "Reporte de equipo" — cruza proyectos, horas, tareas y entregas, así que
 * va como puerto de solo lectura propio en vez de ensanchar `TeamRepository`.
 */
export interface TeamReportPerson {
  readonly id: string;
  readonly fullName: string;
}

export interface TeamReportProjectRow {
  readonly projectId: string;
  readonly name: string;
  readonly slug: string;
  readonly client: { readonly id: string; readonly companyName: string } | null;
  readonly status: 'draft' | 'active' | 'on_hold' | 'finished' | 'cancelled';
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly assignedHours: number | null;
  readonly responsible: TeamReportPerson | null;
  readonly projectLeader: TeamReportPerson | null;
  readonly comment: string | null;
  readonly dataRequestedAt: string | null;
}

export interface TeamReportHoursRow {
  readonly projectId: string;
  readonly userId: string;
  readonly periodApproved: number;
  readonly periodPending: number;
  readonly accumulatedApproved: number;
  readonly accumulatedPending: number;
}

export interface TeamReportTaskRow {
  readonly projectId: string;
  readonly total: number;
  readonly approved: number;
}

export interface TeamReportReader {
  /** Miembros activos del equipo más su líder oficial (si no figura como miembro), por nombre. */
  listPeople(teamId: string, leaderUserId: string | null): Promise<TeamReportPerson[]>;
  /** Proyectos con fila en `project_teams` para el equipo — sin borrados ni cancelados. */
  listProjects(teamId: string): Promise<TeamReportProjectRow[]>;
  /** HH (aprobadas y pendientes) de `userIds` en `projectIds`, hasta `dateTo`, separando lo que cae en el período. */
  sumHours(projectIds: string[], userIds: string[], dateFrom: Date, dateTo: Date): Promise<TeamReportHoursRow[]>;
  listTeamTasks(teamId: string, projectIds: string[]): Promise<TeamReportTaskRow[]>;
  /** Proyectos donde el equipo tiene al menos una entrega aprobada. */
  listProjectsWithApprovedDelivery(teamId: string, projectIds: string[]): Promise<Set<string>>;
  /** `false` si el equipo no tiene relación con el proyecto. */
  updateComment(teamId: string, projectId: string, comment: string | null): Promise<boolean>;
  /** Marca "Solicitada" en los proyectos del equipo a cuyo Líder PM se le pidieron datos. */
  markDataRequested(teamId: string, projectIds: string[], requestedAt: Date): Promise<void>;
}

export const TEAM_REPORT_READER = Symbol('TeamReportReader');
