import { PROJECT_MODULE_DELIVERY_STATUS_LABELS, type ProjectModuleDelivery } from '@kora/contracts';
import type { BadgeTone } from '@/shared/components/ui/Badge';

/**
 * Estado de una entrega tal como se muestra: los tres guardados (`planned`/`delivered`/`approved`)
 * más "Rechazada", que no se guarda — es una entrega que un líder devolvió a `planned` con motivo, y
 * se muestra así hasta que el colaborador la vuelva a marcar como terminada (eso limpia el motivo).
 */
export type DeliveryDisplayStatus = ProjectModuleDelivery['status'] | 'rejected';

export function deliveryDisplayStatus(delivery: Pick<ProjectModuleDelivery, 'status' | 'rejectionReason'>): DeliveryDisplayStatus {
  return delivery.status === 'planned' && delivery.rejectionReason ? 'rejected' : delivery.status;
}

export const DELIVERY_DISPLAY_STATUS_LABEL: Readonly<Record<DeliveryDisplayStatus, string>> = {
  ...PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  rejected: 'Rechazada',
};

export const DELIVERY_DISPLAY_STATUS_TONE: Readonly<Record<DeliveryDisplayStatus, BadgeTone>> = {
  planned: 'neutral',
  rejected: 'danger',
  delivered: 'warning',
  approved: 'success',
};

export const deliveryStatusLabel = (delivery: Pick<ProjectModuleDelivery, 'status' | 'rejectionReason'>): string =>
  DELIVERY_DISPLAY_STATUS_LABEL[deliveryDisplayStatus(delivery)];

export type DeliveryAction = 'complete' | 'assign' | 'approve' | 'reject' | 'revert';

/**
 * Acciones de gestión según el estado — ver `PROJECT_MODULE_DELIVERY_ALLOWED_TRANSITIONS`. Solo para
 * quien puede gestionarla (`delivery.canManage`: líder del proyecto, PMO/admin o líder del equipo).
 * Aprobar/rechazar recién cuando se marcó como terminada; una aprobada solo se revierte. El líder
 * también puede marcarla como terminada en nombre del colaborador asignado (sin asignar, no: el
 * backend exige un responsable antes de dejarla pendiente de aprobación).
 */
export function deliveryActions(
  delivery: Pick<ProjectModuleDelivery, 'status' | 'canManage' | 'teamId' | 'assigneeUserId'>,
): readonly DeliveryAction[] {
  if (!delivery.canManage) return [];
  const assign: DeliveryAction[] = delivery.teamId ? ['assign'] : [];
  if (delivery.status === 'delivered') return ['approve', 'reject', ...assign];
  if (delivery.status === 'approved') return ['revert'];
  return delivery.assigneeUserId ? ['complete', ...assign] : assign;
}

export function deliveryActionLabel(action: DeliveryAction, delivery: Pick<ProjectModuleDelivery, 'assigneeUserId'>): string {
  switch (action) {
    case 'complete':
      return 'Marcar como terminada';
    case 'assign':
      return delivery.assigneeUserId ? 'Reasignar' : 'Asignar colaborador';
    case 'approve':
      return 'Aprobar';
    case 'reject':
      return 'Rechazar';
    case 'revert':
      return 'Revertir aprobación';
  }
}
