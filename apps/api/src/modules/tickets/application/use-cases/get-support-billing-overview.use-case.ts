import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportBillingKpiGroup, SupportBillingOverview, SupportPlanCurrency } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportBillingRowBuilder } from '../services/support-billing-row-builder';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetSupportBillingOverviewQuery {
  /** 'YYYY-MM'. */
  readonly period: string;
}

/**
 * KPIs del panel de Facturación de Soporte para el período consultado. Cruzan
 * TODOS los contratos activos — por eso no viajan junto con la tabla, que se
 * pagina en el servidor (`ListSupportBillingRowsUseCase`). El cálculo de
 * cada contrato (y la regla de "solo el período en curso calcula en vivo")
 * vive en `SupportBillingRowBuilder`.
 */
@Injectable()
export class GetSupportBillingOverviewUseCase implements UseCase<GetSupportBillingOverviewQuery, SupportBillingOverview, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    private readonly rowBuilder: SupportBillingRowBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetSupportBillingOverviewQuery): Promise<Result<SupportBillingOverview, ApplicationError>> {
    const now = this.clock.now();

    const records = await this.plans.listAllActive();
    const clientNames = await this.rowBuilder.resolveClientNames(records);
    const [rows, overdueInvoices] = await Promise.all([
      this.rowBuilder.buildRows(records, query.period, now, clientNames),
      this.invoices.listOverdue(now),
    ]);

    const kpiByCurrency = new Map<SupportPlanCurrency, Omit<SupportBillingKpiGroup, 'currency'>>();
    const kpiGroupFor = (currency: SupportPlanCurrency) => {
      let group = kpiByCurrency.get(currency);
      if (!group) {
        group = { toInvoiceAmount: 0, toInvoiceCount: 0, invoicedAmount: 0, paidAmount: 0, overdueAmount: 0, overdueCount: 0 };
        kpiByCurrency.set(currency, group);
      }
      return group;
    };

    let alertsCount = 0;
    for (const row of rows) {
      if (row.hasAlert) alertsCount++;
      const amountUf = row.amountUf ?? 0;
      if (row.billingStatus === 'to_invoice') {
        const group = kpiGroupFor(row.currency);
        group.toInvoiceAmount += amountUf;
        // Una fila "Por facturar" con monto 0 es solo un contrato sin nada pendiente — no suma al conteo de la tarjeta.
        if (amountUf > 0) group.toInvoiceCount++;
      } else if (row.billingStatus === 'invoiced') {
        const group = kpiGroupFor(row.currency);
        group.invoicedAmount += amountUf;
        if (row.paymentStatus === 'paid') group.paidAmount += amountUf;
      }
    }

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

    const clients = [...new Set(records.map((record) => record.clientId))]
      .map((id) => ({ id, name: clientNames.get(id) ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    return ok({ period: query.period, perCurrency, alertsCount, clients });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
