import type { SupportInvoicePaymentStatus, SupportInvoiceRef } from '@kora/contracts';
import type { SupportInvoiceRecord } from '../../domain/repositories/support-invoice.repository';

/**
 * El estado de pago nunca se guarda — se deriva al leer, para que nunca quede
 * desincronizado del tiempo real (ver el comentario de `support_invoices` en
 * el schema): pagado si tiene `paidAt`; si no, atrasado si `dueAt` ya venció;
 * si no, pendiente.
 */
export function paymentStatusOf(invoice: Pick<SupportInvoiceRecord, 'paidAt' | 'dueAt'>, now: Date): SupportInvoicePaymentStatus {
  if (invoice.paidAt) return 'paid';
  if (invoice.dueAt && invoice.dueAt.getTime() < now.getTime()) return 'overdue';
  return 'pending';
}

/**
 * Estado de pago de un período cuyo total se dividió en varias facturas:
 * atrasado si alguna lo está, pagado solo si están todas pagadas; si no,
 * pendiente. `null` si el período no tiene facturas.
 */
export function aggregatePaymentStatusOf(
  invoices: readonly Pick<SupportInvoiceRecord, 'paidAt' | 'dueAt'>[],
  now: Date,
): SupportInvoicePaymentStatus | null {
  if (invoices.length === 0) return null;
  const statuses = invoices.map((invoice) => paymentStatusOf(invoice, now));
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.every((status) => status === 'paid')) return 'paid';
  return 'pending';
}

/** Las facturas de un período, ordenadas y resumidas para la respuesta. */
export function toInvoiceRefs(invoices: readonly SupportInvoiceRecord[], now: Date): SupportInvoiceRef[] {
  return [...invoices]
    .sort((a, b) => a.position - b.position)
    .map((invoice) => ({ id: invoice.id, folio: invoice.folio, amountUf: invoice.amountUf, paymentStatus: paymentStatusOf(invoice, now) }));
}

/** Suma de montos de las facturas de un período, redondeada a centavos. */
export function sumInvoiceAmounts(invoices: readonly Pick<SupportInvoiceRecord, 'amountUf'>[]): number {
  return Math.round(invoices.reduce((total, invoice) => total + invoice.amountUf, 0) * 100) / 100;
}
