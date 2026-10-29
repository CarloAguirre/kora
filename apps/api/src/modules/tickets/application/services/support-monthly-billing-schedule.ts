import type { SupportMonthlyBillingPeriod } from '@kora/contracts';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRecord } from '../../domain/repositories/support-invoice.repository';
import { monthlyPeriodCharge } from './support-billing-calculator';

/** Tope de meses futuros proyectados — un contrato sin fecha de término solo proyecta el próximo. */
const MAX_PROJECTED_PERIODS = 120;

/**
 * Calendario de facturación de un contrato `monthly` para su ficha: cada mes
 * del contrato con su factura (si la tiene), o con lo que corresponde cobrar.
 *
 * - Los períodos que ya existen (`support_monthly_periods`) salen tal cual:
 *   el vigente y los cerrados sin factura quedan `to_invoice` — se pueden
 *   registrar desde la ficha, así un mes que se cerró sin facturar no queda
 *   perdido.
 * - Los meses futuros todavía no existen (el reconciliador los abre recién
 *   cuando empiezan), así que se proyectan con la misma regla que
 *   `SupportMonthlyPeriodReconciler` — un mes desde el fin del anterior,
 *   mientras el contrato siga vigente — y quedan `upcoming`, con su cuota
 *   estimada.
 *
 * Pura: recibe los períodos ya reconciliados.
 */
export function buildMonthlyBillingSchedule(
  plan: SupportPlanRecord,
  periods: readonly SupportMonthlyPeriodRecord[],
  invoices: readonly SupportInvoiceRecord[],
  now: Date,
): SupportMonthlyBillingPeriod[] {
  if (plan.planType !== 'monthly') return [];

  const today = toUtcDate(now);
  const chain = periods.filter((period) => period.status !== 'cancelled').sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const schedule = chain.map((period): SupportMonthlyBillingPeriod => {
    const periodKey = periodKeyOf(period.startDate);
    const invoice = invoices.find((item) => item.monthlyPeriodId === period.id) ?? invoices.find((item) => item.periodKey === periodKey);
    const hasStarted = period.startDate.getTime() <= today.getTime();
    return {
      monthlyPeriodId: period.id,
      periodKey,
      startDate: toIsoDate(period.startDate),
      endDate: toIsoDate(period.endDate),
      isCurrent: period.status === 'active' && hasStarted && today.getTime() < period.endDate.getTime(),
      status: invoice ? 'invoiced' : hasStarted ? 'to_invoice' : 'upcoming',
      amountUf: invoice ? invoice.amountUf : monthlyPeriodCharge(plan, period).amountUf,
      invoiceId: invoice?.id ?? null,
      folio: invoice?.folio ?? null,
    };
  });

  if (plan.status !== 'active') return schedule;

  const inForce = (from: Date) => plan.endDate === null || from.getTime() < plan.endDate.getTime();
  const maxProjected = plan.endDate === null ? 1 : MAX_PROJECTED_PERIODS;
  let nextStart = chain.at(-1)?.endDate ?? plan.startDate;

  for (let projected = 0; projected < maxProjected && inForce(nextStart); projected += 1) {
    const endDate = addMonthsUtc(nextStart, 1);
    const periodKey = periodKeyOf(nextStart);
    const invoice = invoices.find((item) => item.periodKey === periodKey);
    schedule.push({
      monthlyPeriodId: null,
      periodKey,
      startDate: toIsoDate(nextStart),
      endDate: toIsoDate(endDate),
      isCurrent: false,
      status: invoice ? 'invoiced' : 'upcoming',
      amountUf: invoice
        ? invoice.amountUf
        : monthlyPeriodCharge(plan, { contractedHours: plan.contractedHours, reusedBalanceHours: 0, consumedHoursPeriod: 0, endDate }).amountUf,
      invoiceId: invoice?.id ?? null,
      folio: invoice?.folio ?? null,
    });
    nextStart = endDate;
  }

  return schedule;
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
