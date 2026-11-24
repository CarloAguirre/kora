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
 * Proyectos cuyas horas consume el contrato: solo el proyecto "contenedor" de
 * soporte (`plan.projectId`) — ahí se abren los tickets (el proyecto cubierto
 * va aparte, en "Proyecto de desarrollo") y se cargan las horas de soporte sin
 * ticket. Las horas cargadas directo a un proyecto cubierto son de su
 * desarrollo, no de soporte: antes se sumaban, y vincular un proyecto ya
 * terminado le cargaba al contrato todo su desarrollo dentro de la vigencia.
 * Sin contenedor (no debería pasar) cae a los cubiertos.
 */
export async function resolveSupportPlanHourProjectIds(plans: SupportPlanRepository, plan: SupportPlanRecord): Promise<string[]> {
  if (plan.projectId) return [plan.projectId];
  return resolveSupportPlanProjectIds(plans, plan);
}
