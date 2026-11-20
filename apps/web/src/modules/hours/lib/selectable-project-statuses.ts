import { projectKindOf, type HourEntryAssignment, type ProjectStatus, type ProjectSummary } from '@kora/contracts';

/**
 * Estados de proyecto que se ofrecen al registrar o editar horas: No iniciado
 * y Activo. Detenido, Finalizado y Cancelado quedan fuera; el backend también
 * los rechaza (ver `CreateHourEntryUseCase`).
 */
export const HOUR_ENTRY_PROJECT_STATUSES: ProjectStatus[] = ['draft', 'active'];

/** "Prospecto" incluye ventas en prospecto y cotización. "Proyecto" los aprobados. */
export function filterHourEntryProjects(
  projects: readonly ProjectSummary[],
  assignment: HourEntryAssignment | '',
): ProjectSummary[] {
  if (assignment !== 'Proyecto' && assignment !== 'Prospecto') return [];
  return projects.filter((project) => {
    if (!HOUR_ENTRY_PROJECT_STATUSES.includes(project.status)) return false;
    if (project.type === 'support') return assignment === 'Proyecto';
    const kind = projectKindOf(project);
    return assignment === 'Prospecto'
      ? kind === 'prospect' || kind === 'quoted'
      : kind === 'approved';
  });
}
