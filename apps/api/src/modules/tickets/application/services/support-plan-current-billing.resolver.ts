import { Inject, Injectable } from '@nestjs/common';
import type { SupportInvoiceBillingStatus } from '@kora/contracts';
import type { SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportBillingCalculator } from './support-billing-calculator';

export interface CurrentBillingStatus {
  readonly billingStatus: SupportInvoiceBillingStatus | null;
  readonly amountUf: number;
}

/**
 * Estado de facturación del PERÍODO EN CURSO — usado por la ficha de
 * cliente, la ficha de contrato y el panel de Facturación de Soporte, así
 * que vive en un solo lugar en vez de triplicarse.
 *
 * Si ya existe una factura para el período (`support_invoices`), el monto
 * mostrado es el CONGELADO de esa factura, no el recalculado en vivo — una
 * vez facturado, el monto no cambia aunque se sigan registrando horas.
 */
@Injectable()
export class SupportPlanCurrentBillingResolver {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    private readonly calculator: SupportBillingCalculator,
  ) {}

  async resolve(plan: SupportPlanRecord, linkedProjectIds: readonly string[], now: Date): Promise<CurrentBillingStatus> {
    const calculation = await this.calculator.calculate(plan, linkedProjectIds, now);
    if (!calculation) return { billingStatus: null, amountUf: 0 };

    const existing = await this.invoices.findByPlanAndPeriod(plan.id, calculation.periodKey);
    if (existing) return { billingStatus: 'invoiced', amountUf: existing.amountUf };

    return { billingStatus: 'to_invoice', amountUf: calculation.amountUf };
  }
}
