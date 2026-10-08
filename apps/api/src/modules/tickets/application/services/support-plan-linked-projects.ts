import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';

/**
 * Proyectos que el contrato CUBRE — los que se muestran en su ficha (tabs,
 * "Proyecto único"/"Consolidado"). Contratos con enlaces
 * (`support_plan_projects`) muestran esos proyectos de desarrollo; los
 * legados, sin enlaces, caen al único proyecto de soporte de siempre.
 */
export async function resolveSupportPlanProjectIds(plans: SupportPlanRepository, plan: SupportPlanRecord): Promise<string[]> {
  const linked = await plans.listLinkedProjectIds(plan.id);
  if (linked.length > 0) return linked;
  return plan.projectId ? [plan.projectId] : [];
}

/**
 * Proyectos cuyas horas consume el contrato: los cubiertos MÁS el proyecto
 * "contenedor" de soporte (`plan.projectId`). Un contrato con enlaces recibe
 * horas por los dos lados — las de tickets, que se abren contra el
 * contenedor, y las cargadas directo a un proyecto cubierto —, así que sumar
 * solo uno subcontaría el consumo real. `consolidated` además pool-ea entre
 * todos sus proyectos cubiertos.
 */
export async function resolveSupportPlanHourProjectIds(plans: SupportPlanRepository, plan: SupportPlanRecord): Promise<string[]> {
  const covered = await resolveSupportPlanProjectIds(plans, plan);
  return plan.projectId && !covered.includes(plan.projectId) ? [plan.projectId, ...covered] : covered;
}
