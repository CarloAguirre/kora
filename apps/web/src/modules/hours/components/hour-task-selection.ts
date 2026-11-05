/**
 * «Otro trabajo del bloque» es una elección consciente del usuario sin tarea
 * operativa vinculada. No puede convertirse en FK ni inferirse por nombres.
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
