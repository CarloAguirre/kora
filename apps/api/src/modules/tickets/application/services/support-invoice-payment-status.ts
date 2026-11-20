import type { SupportInvoicePaymentStatus, SupportInvoicePendingPeriod, SupportInvoiceRef } from '@kora/contracts';
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
    .map((invoice) => ({ id: invoice.id, folio: invoice.folio, amountUf: invoice.amountUf, paymentStatus: paymentStatusOf(invoice, now), hasAttachment: invoice.hasAttachment ?? false }));
}

/** Suma de montos de las facturas de un período, redondeada a centavos. */
export function sumInvoiceAmounts(invoices: readonly Pick<SupportInvoiceRecord, 'amountUf'>[]): number {
  return Math.round(invoices.reduce((total, invoice) => total + invoice.amountUf, 0) * 100) / 100;
}

export interface SupportInvoicePeriodBilling {
  readonly status: 'partially_invoiced' | 'invoiced';
  /** Suma de las facturas registradas. */
  readonly invoicedAmountUf: number;
  /** Total esperado del período — igual a lo facturado si quedó cerrado. */
  readonly totalAmountUf: number;
  /** Lo que falta por facturar — 0 si quedó cerrado. */
  readonly pendingAmountUf: number;
}

/**
 * Estado de facturación de un período a partir de sus facturas: "facturado
 * parcial" mientras la suma no alcance el total esperado (`targetAmountUf`,
 * que se repite en todas sus filas); si no, "facturado". `null` si el período
 * no tiene facturas ("por facturar").
 */
export function periodBillingOf(
  invoices: readonly Pick<SupportInvoiceRecord, 'amountUf' | 'targetAmountUf'>[],
): SupportInvoicePeriodBilling | null {
  if (invoices.length === 0) return null;
  const invoicedAmountUf = sumInvoiceAmounts(invoices);
  const target = invoices.reduce((max, invoice) => Math.max(max, invoice.targetAmountUf ?? 0), 0);
  const totalAmountUf = round2(Math.max(invoicedAmountUf, target));
  const pendingAmountUf = round2(totalAmountUf - invoicedAmountUf);
  return { status: pendingAmountUf > 0 ? 'partially_invoiced' : 'invoiced', invoicedAmountUf, totalAmountUf, pendingAmountUf };
}

/**
 * Los períodos "facturado parcial" de un conjunto de facturas (de un mismo
 * plan), del más antiguo al más nuevo — para registrar las que faltan o
 * cerrarlos.
 */
export function listPendingPeriods(invoices: readonly SupportInvoiceRecord[], now: Date): SupportInvoicePendingPeriod[] {
  const byPeriod = new Map<string, SupportInvoiceRecord[]>();
  for (const invoice of invoices) {
    const group = byPeriod.get(invoice.periodKey);
    if (group) group.push(invoice);
    else byPeriod.set(invoice.periodKey, [invoice]);
  }
  const pending: SupportInvoicePendingPeriod[] = [];
  for (const [periodKey, periodInvoices] of byPeriod) {
    const billing = periodBillingOf(periodInvoices);
    if (billing?.status !== 'partially_invoiced') continue;
    pending.push({
      periodKey,
      monthlyPeriodId: periodInvoices.find((invoice) => invoice.monthlyPeriodId !== null)?.monthlyPeriodId ?? null,
      totalAmountUf: billing.totalAmountUf,
      invoicedAmountUf: billing.invoicedAmountUf,
      pendingAmountUf: billing.pendingAmountUf,
      invoices: toInvoiceRefs(periodInvoices, now),
    });
  }
  return pending.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
