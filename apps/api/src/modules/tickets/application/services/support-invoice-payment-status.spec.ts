import { describe, expect, it } from 'vitest';
import type { SupportInvoiceRecord } from '../../domain/repositories/support-invoice.repository';
import { listPendingPeriods, periodBillingOf } from './support-invoice-payment-status';

const invoice = (overrides: Partial<SupportInvoiceRecord> = {}): SupportInvoiceRecord => ({
  id: 'invoice-1',
  planId: 'plan-1',
  periodKey: '2026-10',
  amountUf: 50,
  currency: 'UF',
  hoursBilled: null,
  position: 0,
  targetAmountUf: null,
  folio: '1',
  invoicedAt: new Date('2026-10-05T00:00:00Z'),
  dueAt: null,
  paidAt: null,
  attachmentName: null,
  monthlyPeriodId: null,
  ...overrides,
});

describe('periodBillingOf', () => {
  it('sin facturas, el período está por facturar', () => {
    expect(periodBillingOf([])).toBeNull();
  });

  it('sin total esperado, el período queda facturado por la suma de sus facturas', () => {
    expect(periodBillingOf([invoice(), invoice({ id: '2', amountUf: 25.5 })])).toEqual({
      status: 'invoiced',
      invoicedAmountUf: 75.5,
      totalAmountUf: 75.5,
      pendingAmountUf: 0,
    });
  });

  it('con un total esperado mayor a la suma, queda facturado parcial con el saldo pendiente', () => {
    expect(periodBillingOf([invoice({ targetAmountUf: 134.81 }), invoice({ id: '2', amountUf: 44.27, targetAmountUf: 134.81 })])).toEqual({
      status: 'partially_invoiced',
      invoicedAmountUf: 94.27,
      totalAmountUf: 134.81,
      pendingAmountUf: 40.54,
    });
  });

  it('si la suma ya alcanza el total esperado, queda facturado', () => {
    expect(periodBillingOf([invoice({ amountUf: 100, targetAmountUf: 100 })])?.status).toBe('invoiced');
  });
});

describe('listPendingPeriods', () => {
  it('lista solo los períodos con saldo, del más antiguo al más nuevo', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const pending = listPendingPeriods(
      [
        invoice({ id: 'nov', periodKey: '2026-11', targetAmountUf: 80 }),
        invoice({ id: 'sep', periodKey: '2026-09' }),
        invoice({ id: 'oct', periodKey: '2026-10', targetAmountUf: 120, monthlyPeriodId: 'period-oct' }),
      ],
      now,
    );
    expect(pending.map((period) => [period.periodKey, period.pendingAmountUf, period.monthlyPeriodId])).toEqual([
      ['2026-10', 70, 'period-oct'],
      ['2026-11', 30, null],
    ]);
  });
});
