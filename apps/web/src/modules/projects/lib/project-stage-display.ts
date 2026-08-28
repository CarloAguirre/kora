import { PROJECT_PHASE_LABELS, PROJECT_SALES_STAGE_LABELS, type ProjectSummary } from '@kora/contracts';

/**
 * Etiqueta de "Etapa de avance" para la columna del listado.
 *
 * La v1 derivaba esto de `etapa`/`fase_proyecto`/`estado_proyecto`, tres
 * campos legados que se pisaban entre sí (ver docs/DECISION-M3-ESTADOS.md) —
 * de ahí que `src/utils/developmentProjectLifecycle.ts` necesitara casi 200
 * líneas de normalización para sacar un solo valor coherente. Con el modelo
 * de cuatro campos independientes de la v2 la misma etiqueta sale de una
 * prioridad simple, sin reconstruir esa lógica confusa.
 */
export function getProjectStageLabel(project: Pick<ProjectSummary, 'status' | 'type' | 'salesStage' | 'phase'>): string {
  if (project.status === 'finished') return 'Finalizado';
  if (project.status === 'cancelled') return 'Cancelado';
  if (project.status === 'on_hold') return 'Detenido';
  if (project.status === 'draft') return 'No iniciado';

  if (project.type === 'support') return 'Soporte';
  if (project.salesStage && project.salesStage !== 'approved') return PROJECT_SALES_STAGE_LABELS[project.salesStage];
  if (project.phase) return PROJECT_PHASE_LABELS[project.phase];
  return 'No Aplica';
}
