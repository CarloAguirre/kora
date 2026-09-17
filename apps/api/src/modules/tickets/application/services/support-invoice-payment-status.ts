import type { SupportInvoicePaymentStatus } from '@kora/contracts';
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
