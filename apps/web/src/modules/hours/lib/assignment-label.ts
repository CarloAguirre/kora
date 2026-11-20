import { resolveHourEntryProjectWorkType, type HourEntrySummary } from '@kora/contracts';

/**
 * "Asignación" a mostrar de un registro: si tiene proyecto, la etapa comercial
 * ACTUAL del proyecto (Prospecto/Cotización/Proyecto/Soporte) — misma regla
 * que el reporte de Capacity —; si no, la asignación guardada (Vacaciones,
 * Capacitación…). Lo que eligió la persona al registrar puede haber quedado
 * desfasado si el proyecto cambió de etapa o se eligió mal.
 */
export function hourEntryAssignmentLabel(entry: Pick<HourEntrySummary, 'project' | 'assignment'>, fallback = 'Desarrollo'): string {
  if (entry.project?.type) return resolveHourEntryProjectWorkType(entry.project);
  return entry.assignment ?? fallback;
}
