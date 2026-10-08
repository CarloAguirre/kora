import {
  PROJECT_PAYMENT_STATUS_LABELS,
  PROJECT_PHASE_LABELS,
  type ProjectPaymentStatus,
  type ProjectPaymentTrigger,
  type ProjectPhase,
} from '@kora/contracts';
import type { BadgeTone } from '@/shared/components/ui/Badge';

/** `YYYY-MM-DD` → `DD-MM-YYYY`, sin pasar por la zona horaria local. */
export function formatIsoDay(isoDate: string): string {
  return isoDate.split('-').reverse().join('-');
}

/** `YYYY-MM-DD` + días (o meses), sin pasar por la zona horaria local. */
export function addToIsoDay(isoDate: string, amount: { days?: number; months?: number }): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (amount.months) date.setUTCMonth(date.getUTCMonth() + amount.months);
  if (amount.days) date.setUTCDate(date.getUTCDate() + amount.days);
  return date.toISOString().slice(0, 10);
}

/** "Al aprobar el proyecto", "Al entrar en Marcha blanca", "El 08-10-2026", "Manual". */
export function paymentTriggerLabel(trigger: {
  triggerType: ProjectPaymentTrigger | null;
  triggerPhase: ProjectPhase | null;
  triggerDate: string | null;
}): string {
  switch (trigger.triggerType) {
    case 'approval':
      return 'Al aprobar el proyecto';
    case 'phase':
      return trigger.triggerPhase ? `Al entrar en ${PROJECT_PHASE_LABELS[trigger.triggerPhase]}` : 'Al entrar en una fase';
    case 'date':
      return trigger.triggerDate ? `El ${formatIsoDay(trigger.triggerDate)}` : 'En una fecha';
    case 'manual':
      return 'Manual';
    default:
      return '—';
  }
}

/** Estado visible del tramo: "Atrasado" se superpone a "Facturado" (no es un estado guardado). */
export function paymentStatusLabel(status: ProjectPaymentStatus, isOverdue: boolean): string {
  return isOverdue ? 'Atrasado' : PROJECT_PAYMENT_STATUS_LABELS[status];
}

const STATUS_TONE: Readonly<Record<ProjectPaymentStatus, BadgeTone>> = {
  pending: 'neutral',
  to_invoice: 'warning',
  invoiced: 'info',
  paid: 'success',
};

export function paymentStatusTone(status: ProjectPaymentStatus, isOverdue: boolean): BadgeTone {
  return isOverdue ? 'danger' : STATUS_TONE[status];
}
