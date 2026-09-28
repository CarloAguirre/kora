import { describe, expect, it } from 'vitest';
import type { SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRecord, SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import type { SupportBillingCalculation, SupportBillingCalculator } from './support-billing-calculator';
import { SupportPlanCurrentBillingResolver } from './support-plan-current-billing.resolver';

class FakeCalculator implements Pick<SupportBillingCalculator, 'calculate'> {
  constructor(private readonly result: SupportBillingCalculation | null) {}
  async calculate(): Promise<SupportBillingCalculation | null> {
    return this.result;
  }
}

class FakeSupportInvoiceRepository implements Pick<SupportInvoiceRepository, 'findByPlanAndPeriod'> {
  constructor(private readonly invoices: Pick<SupportInvoiceRecord, 'planId' | 'periodKey' | 'amountUf'>[]) {}
  async findByPlanAndPeriod(planId: string, periodKey: string): Promise<SupportInvoiceRecord | null> {
    const found = this.invoices.find((invoice) => invoice.planId === planId && invoice.periodKey === periodKey);
    return (found as SupportInvoiceRecord | undefined) ?? null;
  }
}

function buildResolver(calculation: SupportBillingCalculation | null, invoices: Pick<SupportInvoiceRecord, 'planId' | 'periodKey' | 'amountUf'>[] = []) {
  return new SupportPlanCurrentBillingResolver(
    new FakeSupportInvoiceRepository(invoices) as unknown as SupportInvoiceRepository,
    new FakeCalculator(calculation) as unknown as SupportBillingCalculator,
  );
}

const PLAN = { id: 'plan-1', planType: 'bundle' } as SupportPlanRecord;
const TODAY = new Date('2026-09-15T12:00:00Z');

describe('SupportPlanCurrentBillingResolver', () => {
  it('queda por facturar con el monto calculado en vivo cuando aún no hay factura del período', async () => {
    const resolver = buildResolver({ amountUf: 15, hoursBilled: 12.5, periodKey: '2026-09', monthlyPeriodId: null });

    expect(await resolver.resolve(PLAN, [], TODAY)).toEqual({ billingStatus: 'to_invoice', amountUf: 15 });
  });

  it('muestra el monto CONGELADO de la factura del período, no el recalculado', async () => {
    const resolver = buildResolver({ amountUf: 18, hoursBilled: 15, periodKey: '2026-09', monthlyPeriodId: null }, [
      { planId: 'plan-1', periodKey: '2026-09', amountUf: 9.6 },
    ]);

    expect(await resolver.resolve(PLAN, [], TODAY)).toEqual({ billingStatus: 'invoiced', amountUf: 9.6 });
  });

  it('sigue mostrando "facturado" cuando el excedente de la bolsa ya se facturó entero este mes (cálculo en 0)', async () => {
    const resolver = buildResolver(null, [{ planId: 'plan-1', periodKey: '2026-09', amountUf: 9.6 }]);

    expect(await resolver.resolve(PLAN, [], TODAY)).toEqual({ billingStatus: 'invoiced', amountUf: 9.6 });
  });

  it('queda sin movimiento cuando no hay nada que facturar ni factura del mes', async () => {
    const resolver = buildResolver(null, [{ planId: 'plan-1', periodKey: '2026-08', amountUf: 9.6 }]);

    expect(await resolver.resolve(PLAN, [], TODAY)).toEqual({ billingStatus: null, amountUf: 0 });
  });
});
