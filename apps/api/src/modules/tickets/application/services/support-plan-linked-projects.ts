import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';

/**
 * Contratos `consolidated` pool-ean las horas entre varios proyectos de
 * desarrollo (`support_plan_projects`) — sumar solo un proyecto
 * subcontaría el consumo real del contrato. Legado (`plan.projectId`
 * directo) sigue funcionando igual que antes: sin filas de enlace, cae al
 * único proyecto de siempre.
 */
export async function resolveSupportPlanProjectIds(plans: SupportPlanRepository, plan: SupportPlanRecord): Promise<string[]> {
  const linked = await plans.listLinkedProjectIds(plan.id);
  if (linked.length > 0) return linked;
  return plan.projectId ? [plan.projectId] : [];
}
