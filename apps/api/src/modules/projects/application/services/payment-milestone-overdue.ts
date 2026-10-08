import type { ProjectPaymentMilestoneRecord } from '../../domain/repositories/project-payment-milestone.repository';

/**
 * "Atrasado" no es un estado guardado: un tramo facturado, sin pago, cuyo vencimiento ya pasó. `today` es
 * el día en hora de Chile (`progressToday`) — el vencimiento vence al terminar ese día, no a medianoche UTC.
 */
export function isPaymentMilestoneOverdue(
  milestone: Pick<ProjectPaymentMilestoneRecord, 'status' | 'dueAt'>,
  today: string,
): boolean {
  return milestone.status === 'invoiced' && milestone.dueAt !== null && milestone.dueAt.toISOString().slice(0, 10) < today;
}

/** Fecha (`date`, medianoche UTC) + `days` días — vencimiento por defecto de una factura (emisión + plazo). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
