import { Inject, Injectable } from '@nestjs/common';
import type { SupportInvoiceBillingStatus } from '@kora/contracts';
import type { SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportBillingCalculator } from './support-billing-calculator';
import { sumInvoiceAmounts } from './support-invoice-payment-status';

export interface CurrentBillingStatus {
  readonly billingStatus: SupportInvoiceBillingStatus | null;
  readonly amountUf: number;
}

/**
 * Estado de facturación del PERÍODO EN CURSO — usado por la ficha de
 * cliente, la ficha de contrato y el panel de Facturación de Soporte, así
 * que vive en un solo lugar en vez de triplicarse.
 *
 * Si el período ya tiene facturas (`support_invoices`), el monto mostrado es
 * el CONGELADO (la suma de sus facturas), no el recalculado en vivo — una vez
 * facturado, el monto no cambia aunque se sigan registrando horas.
 */
@Injectable()
export class SupportPlanCurrentBillingResolver {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    private readonly calculator: SupportBillingCalculator,
  ) {}

  async resolve(plan: SupportPlanRecord, linkedProjectIds: readonly string[], now: Date): Promise<CurrentBillingStatus> {
    const calculation = await this.calculator.calculate(plan, linkedProjectIds, now);
    if (!calculation) {
      /** Sin monto nuevo no significa "sin movimiento": una bolsa cuyo excedente ya se facturó este mes calcula 0, pero su factura del mes existe y debe seguir viéndose. */
      const invoicedThisMonth = await this.invoices.listByPlanAndPeriod(plan.id, periodKeyOf(now));
      return invoicedThisMonth.length > 0
        ? { billingStatus: 'invoiced', amountUf: sumInvoiceAmounts(invoicedThisMonth) }
        : { billingStatus: null, amountUf: 0 };
    }

    const existing = await this.invoices.listByPlanAndPeriod(plan.id, calculation.periodKey);
    if (existing.length > 0) return { billingStatus: 'invoiced', amountUf: sumInvoiceAmounts(existing) };

    return { billingStatus: 'to_invoice', amountUf: calculation.amountUf };
  }
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
