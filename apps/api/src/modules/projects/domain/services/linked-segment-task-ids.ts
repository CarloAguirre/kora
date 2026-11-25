import type { ProjectModuleRecord, ProjectModuleSegmentRecord } from '../repositories/project-module.repository';

/** Mismo criterio que getLinkedBlockTasks de React, con prioridad para el vínculo exacto.
 * Es necesario porque las tareas antiguas se asociaban por un marcador en
 * descripción o por ser el único bloque del equipo dentro de la fase.
 */
export function linkedSegmentTaskIds(
  module: Pick<ProjectModuleRecord, 'segments' | 'tasks'>,
  segment: Pick<ProjectModuleSegmentRecord, 'id' | 'teamId'>,
): string[] {
  const teamSegments = module.segments.filter((item) => item.teamId === segment.teamId);
  return module.tasks.filter((task) => {
    if (task.segmentId != null) return task.segmentId === segment.id;
    if (task.teamId !== segment.teamId || task.cancelledAt != null) return false;
    const legacyMarker = task.description?.match(/ · ID ([0-9a-fA-F-]{36})/);
    if (legacyMarker) return legacyMarker[1]?.toLowerCase() === segment.id.toLowerCase();
    return teamSegments.length === 1;
  }).map((task) => task.id);
}
