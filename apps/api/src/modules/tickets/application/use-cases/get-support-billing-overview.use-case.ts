import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportBillingKpiGroup, SupportBillingOverview, SupportBillingRow, SupportPlanCurrency } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRecord, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { computeSupportPlanAlerts } from '../services/support-plan-alerts';
import { SupportMonthlyPeriodReconciler } from '../services/support-monthly-period-reconciler';
import { SupportPlanCurrentBillingResolver, type CurrentBillingStatus } from '../services/support-plan-current-billing.resolver';
import { resolveSupportPlanName } from '../services/support-plan-naming';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import { paymentStatusOf } from '../services/support-invoice-payment-status';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetSupportBillingOverviewQuery {
  /** 'YYYY-MM'. */
  readonly period: string;
}

/** Sin "Sin movimiento": un contrato sin nada pendiente se muestra "Por facturar" con monto 0. */
interface BillingCell {
  readonly amountUf: number;
  readonly billingStatus: 'to_invoice' | 'invoiced';
  readonly paymentStatus: SupportBillingRow['paymentStatus'];
}

/**
 * Panel de Facturación de Soporte: una fila por contrato activo, en el
 * período consultado, más los KPIs agregados.
 *
 * Regla obligatoria: SOLO el período en curso (el mes calendario de hoy)
 * calcula un monto en vivo. Cualquier otro período consultado — pasado o
 * futuro — muestra únicamente facturas que existen de verdad; si no hay
 * ninguna, la fila queda "Por facturar" con monto 0. Sin esta regla, abrir un período
 * viejo inventaría deuda en todos los contratos (mismo criterio que
 * `getCycle()` en el prototipo de referencia: solo el período vigente es
 * editable, el resto es historial de solo lectura).
 */
@Injectable()
export class GetSupportBillingOverviewUseCase implements UseCase<GetSupportBillingOverviewQuery, SupportBillingOverview, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    private readonly currentBilling: SupportPlanCurrentBillingResolver,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    private readonly periods: SupportMonthlyPeriodReconciler,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetSupportBillingOverviewQuery): Promise<Result<SupportBillingOverview, ApplicationError>> {
    const now = this.clock.now();
    const isLivePeriod = query.period === periodKeyOf(now);

    const records = await this.plans.listAllActive();
    const clientNames = await this.resolveClientNames(records);

    const rows: SupportBillingRow[] = [];
    const kpiByCurrency = new Map<SupportPlanCurrency, Omit<SupportBillingKpiGroup, 'currency'>>();
    let alertsCount = 0;

    const kpiGroupFor = (currency: SupportPlanCurrency) => {
      let group = kpiByCurrency.get(currency);
      if (!group) {
        group = { toInvoiceAmount: 0, toInvoiceCount: 0, invoicedAmount: 0, paidAmount: 0, overdueAmount: 0, overdueCount: 0 };
        kpiByCurrency.set(currency, group);
      }
      return group;
    };

    for (const record of records) {
      const linkedIds = await this.summaryBuilder.resolveLinkedProjectIds(record);
      const periods = await this.periods.listPeriods(record, now);
      const summary = await this.summaryBuilder.build(record, linkedIds, now);
      const current = await this.currentBilling.resolve(record, linkedIds, now);
      // Mismo criterio que la ficha del contrato (`SupportPlanBillingAction`): una alerta solo pide revisión mientras el período en curso siga por facturar — una vez registrada la factura, queda resuelta y no debe seguir contando acá.
      const hasAlert = current.billingStatus === 'to_invoice' && computeSupportPlanAlerts(record, periods, summary.usedHours, now).length > 0;
      if (hasAlert) alertsCount++;

      const planInvoices = await this.invoices.listForPlan(record.id);
      const isOverdue = planInvoices.some((invoice) => paymentStatusOf(invoice, now) === 'overdue');

      // Migrados por el ETL antes de que `name` existiera como columna — sin este fallback, el panel mostraría el nombre en blanco para los 30 contratos legados.
      const linkedProjects = record.name ? [] : await this.projects.findManyByIds(linkedIds);
      const planName = resolveSupportPlanName(record.name, record.scope, linkedProjects.map((p) => p.name), clientNames.get(record.clientId) ?? '');

      const { amountUf, billingStatus, paymentStatus } = isLivePeriod
        ? await this.currentPeriodRow(record, current, now)
        : this.pastPeriodRow(planInvoices, query.period, now);

      if (billingStatus === 'to_invoice') {
        const group = kpiGroupFor(record.currency);
        group.toInvoiceAmount += amountUf;
        // Una fila "Por facturar" con monto 0 es solo un contrato sin nada pendiente — no suma al conteo de la tarjeta.
        if (amountUf > 0) group.toInvoiceCount++;
      } else if (billingStatus === 'invoiced') {
        const group = kpiGroupFor(record.currency);
        group.invoicedAmount += amountUf;
        if (paymentStatus === 'paid') group.paidAmount += amountUf;
      }

      rows.push({
        planId: record.id,
        planName,
        clientId: record.clientId,
        clientName: clientNames.get(record.clientId) ?? '',
        scope: record.scope,
        planType: record.planType,
        amountUf,
        currency: record.currency,
        billingStatus,
        paymentStatus,
        hasAlert,
        isOverdue,
      });
    }

    const overdueInvoices = await this.invoices.listOverdue(now);
    for (const invoice of overdueInvoices) {
      const group = kpiGroupFor(invoice.currency);
      group.overdueAmount += invoice.amountUf;
      group.overdueCount++;
    }

    const perCurrency: SupportBillingKpiGroup[] = [...kpiByCurrency.entries()].map(([currency, group]) => ({
      currency,
      toInvoiceAmount: round2(group.toInvoiceAmount),
      toInvoiceCount: group.toInvoiceCount,
      invoicedAmount: round2(group.invoicedAmount),
      paidAmount: round2(group.paidAmount),
      overdueAmount: round2(group.overdueAmount),
      overdueCount: group.overdueCount,
    }));

    return ok({
      period: query.period,
      perCurrency,
      alertsCount,
      rows,
    });
  }

  private async currentPeriodRow(
    record: SupportPlanRecord,
    current: CurrentBillingStatus,
    now: Date,
  ): Promise<BillingCell> {
    if (current.billingStatus === 'invoiced') {
      const invoice = await this.invoices.findByPlanAndPeriod(record.id, periodKeyOf(now));
      return { amountUf: current.amountUf, billingStatus: 'invoiced', paymentStatus: invoice ? paymentStatusOf(invoice, now) : null };
    }
    return { amountUf: current.amountUf, billingStatus: 'to_invoice', paymentStatus: null };
  }

  private pastPeriodRow(
    planInvoices: readonly SupportInvoiceRecord[],
    period: string,
    now: Date,
  ): BillingCell {
    const invoice = planInvoices.find((item) => item.periodKey === period);
    if (!invoice) return { amountUf: 0, billingStatus: 'to_invoice', paymentStatus: null };
    return { amountUf: invoice.amountUf, billingStatus: 'invoiced', paymentStatus: paymentStatusOf(invoice, now) };
  }

  private async resolveClientNames(records: readonly SupportPlanRecord[]): Promise<Map<string, string>> {
    const uniqueClientIds = [...new Set(records.map((record) => record.clientId))];
    const entries = await Promise.all(
      uniqueClientIds.map(async (clientId) => [clientId, (await this.clients.findById(clientId))?.companyName ?? ''] as const),
    );
    return new Map(entries);
  }
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
