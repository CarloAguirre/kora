import type { TransactionContext } from '@kora/core';
import type { ProjectPaymentPlanItemInput } from '@kora/contracts';
import type {
  ProjectPaymentMilestoneRecord,
  ProjectPaymentMilestoneRepository,
  ProjectPaymentMilestoneSchedule,
} from '../../domain/repositories/project-payment-milestone.repository';

/** Cronograma normalizado: el dato del hito solo se guarda para su tipo (fase para `phase`, fecha para `date`). */
export function toPaymentMilestoneSchedule(
  item: Omit<ProjectPaymentPlanItemInput, 'id'>,
  fallbackSortOrder: number,
): ProjectPaymentMilestoneSchedule {
  return {
    name: item.name,
    percent: item.percent ?? null,
    amount: item.amount,
    sortOrder: item.sortOrder ?? fallbackSortOrder,
    triggerType: item.triggerType,
    triggerPhase: item.triggerType === 'phase' ? (item.triggerPhase ?? null) : null,
    triggerDate: item.triggerType === 'date' && item.triggerDate ? new Date(item.triggerDate) : null,
  };
}

const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** ¿Cambió algo que decide si el tramo está por facturar (monto o hito)? */
export function paymentScheduleChanged(current: ProjectPaymentMilestoneRecord, next: ProjectPaymentMilestoneSchedule): boolean {
  return (
    current.amount !== next.amount ||
    current.triggerType !== next.triggerType ||
    current.triggerPhase !== next.triggerPhase ||
    !sameDay(current.triggerDate, next.triggerDate)
  );
}

/**
 * Reemplaza el plan de pago del proyecto por `items` (el formulario de crear/editar proyecto manda la
 * lista completa): con `id` actualiza ese tramo, sin `id` lo crea, y quita los que ya no vienen — salvo
 * los facturados/pagados, que nunca se borran por esta vía (su factura existe aunque el plan cambie).
 *
 * Un tramo "Por facturar" cuyo monto o hito cambió vuelve a "Pendiente" si `isReady` dice que ya no
 * cumple su hito; si sigue cumpliéndolo, se deja como está (sin reenviar el aviso). Promover los que
 * quedan listos es aparte — `PaymentMilestoneTriggerService.promote`, después de esto.
 */
export async function syncPaymentPlan(
  repository: ProjectPaymentMilestoneRepository,
  projectId: string,
  items: readonly ProjectPaymentPlanItemInput[],
  isReady: (milestone: ProjectPaymentMilestoneRecord) => boolean,
  context?: TransactionContext,
): Promise<void> {
  const existing = await repository.listForProject(projectId, context);
  const existingById = new Map(existing.map((milestone) => [milestone.id, milestone]));
  const keptIds = new Set<string>();

  for (const [index, item] of items.entries()) {
    const schedule = toPaymentMilestoneSchedule(item, index);
    const current = item.id ? existingById.get(item.id) : undefined;

    if (!current) {
      await repository.create({ projectId, ...schedule }, context);
      continue;
    }

    keptIds.add(current.id);
    const demote =
      current.status === 'to_invoice' &&
      paymentScheduleChanged(current, schedule) &&
      !isReady({ ...current, ...schedule, status: 'pending' });
    await repository.update(current.id, { ...schedule, ...(demote ? { status: 'pending' as const } : {}) }, context);
  }

  for (const milestone of existing) {
    if (keptIds.has(milestone.id)) continue;
    if (milestone.status === 'pending' || milestone.status === 'to_invoice') {
      await repository.remove(milestone.id, context);
    }
  }
}
