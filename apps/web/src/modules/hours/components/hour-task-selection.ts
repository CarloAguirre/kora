import type { ProjectPhaseOption } from '@kora/contracts';

/**
 * «Asignar a otra» permite registrar una actividad sin vincularla a una tarea.
 * Es una elección consciente, nunca una reasignación automática ni una FK.
 */
export const OTHER_TASK_OPTION = '__other__';

export const toHourTaskId = (value: string | null | undefined): string | undefined =>
  value && value !== OTHER_TASK_OPTION ? value : undefined;

export const formatTaskHourSummary = (
  approved: number | null | undefined,
  estimated: number | null | undefined,
): string => {
  const fmt = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return estimated == null
    ? `${fmt(approved ?? 0)} HH aprobadas · sin estimación`
    : `${fmt(approved ?? 0)} de ${fmt(estimated)} HH aprobadas`;
};

/** Autocompleta Actividad al escoger tarea, sin conservar un nombre erróneo al elegir «Otro». */
export const activityForTaskChange = (
  previousActivity: string,
  previousTaskName: string | undefined,
  nextTaskName: string | undefined,
): string => {
  if (nextTaskName) return nextTaskName;
  return previousActivity === previousTaskName ? '' : previousActivity;
};

/**
 * Informa el aprobador incluso antes de elegir fase, pero solo cuando todas
 * las tareas asignadas al autor apuntan a un único líder. Nunca presupone
 * un líder en proyectos con múltiples equipos.
 */
export function resolveHourApprover(
  phases: readonly ProjectPhaseOption[] | undefined,
  ownerUserId: string | undefined,
  selectedSegmentId?: string,
): string | null {
  if (!phases || !ownerUserId) return null;
  const eligible = phases.flatMap((phase) => phase.segments.filter((segment) =>
    phase.tasks.some((task) =>
      !task.cancelledAt && task.assigneeUserId === ownerUserId && task.segmentId === segment.id)));
  const selected = eligible.find((segment) => segment.id === selectedSegmentId)?.leaderName;
  if (selected) return selected;
  const names = [...new Set(eligible.flatMap((segment) => segment.leaderName ? [segment.leaderName] : []))];
  return names.length === 1 ? names[0]! : null;
}
