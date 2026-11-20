import { describe, expect, it } from 'vitest';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRecord } from '../../domain/repositories/support-invoice.repository';
import { buildMonthlyBillingSchedule } from './support-monthly-billing-schedule';

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Igual que "Soporte Tierra Viva": mensual oct–dic, 10 HH a 25 la hora. */
function plan(overrides: Partial<SupportPlanRecord> = {}): SupportPlanRecord {
  return {
    id: 'plan-1',
    planType: 'monthly',
    surplusPolicy: 'accumulate',
    status: 'active',
    startDate: utc('2026-10-01'),
    endDate: utc('2026-12-31'),
    contractedHours: 10,
    planValueUf: 25,
    extraHourValueUf: 25,
    ...overrides,
  } as SupportPlanRecord;
}

function period(overrides: Partial<SupportMonthlyPeriodRecord> = {}): SupportMonthlyPeriodRecord {
  return {
    id: 'period-oct',
    planId: 'plan-1',
    startDate: utc('2026-10-01'),
    endDate: utc('2026-11-01'),
    contractedHours: 10,
    reusedBalanceHours: 0,
    consumedHoursStart: 0,
    consumedHoursPeriod: 4,
    consumedHoursEnd: null,
    surplusHours: 6,
    status: 'active',
    ...overrides,
  };
}

const invoice = (overrides: Partial<SupportInvoiceRecord> = {}) =>
  ({ id: 'inv-1', planId: 'plan-1', periodKey: '2026-10', amountUf: 250, position: 0, folio: '27846', monthlyPeriodId: 'period-oct', paidAt: null, dueAt: null, ...overrides }) as SupportInvoiceRecord;

describe('buildMonthlyBillingSchedule', () => {
  it('informa si cada factura tiene un PDF real, no solo el nombre legado', () => {
    const schedule = buildMonthlyBillingSchedule(plan(), [period()], [
      invoice({ hasAttachment: true }),
      invoice({ id: 'inv-2', position: 1, attachmentName: 'legado.pdf' }),
    ], utc('2026-10-29'));
    expect(schedule[0]!.invoices.map((item) => item.hasAttachment)).toEqual([true, false]);
  });

  it('lista el mes vigente y proyecta los meses que faltan hasta el término del contrato', () => {
    const schedule = buildMonthlyBillingSchedule(plan(), [period()], [], utc('2026-10-29'));
    expect(schedule.map((item) => [item.periodKey, item.status, item.amountUf, item.isCurrent])).toEqual([
      ['2026-10', 'to_invoice', 250, true],
      ['2026-11', 'upcoming', 250, false],
      ['2026-12', 'upcoming', 250, false],
    ]);
    expect(schedule[1]).toMatchObject({ monthlyPeriodId: null, startDate: '2026-11-01', endDate: '2026-12-01' });
  });

  it('muestra el monto congelado y el folio de la factura ya registrada', () => {
    const schedule = buildMonthlyBillingSchedule(plan(), [period()], [invoice({ amountUf: 240 })], utc('2026-10-29'));
    expect(schedule[0]).toMatchObject({ status: 'invoiced', amountUf: 240, invoices: [{ id: 'inv-1', folio: '27846', amountUf: 240 }] });
  });

  it('con el total dividido en varias facturas, suma sus montos y lista sus folios en orden', () => {
    const schedule = buildMonthlyBillingSchedule(
      plan(),
      [period()],
      [invoice({ id: 'inv-2', folio: '27847', amountUf: 34.81, position: 1 }), invoice({ amountUf: 100 })],
      utc('2026-10-29'),
    );
    expect(schedule[0]).toMatchObject({ status: 'invoiced', amountUf: 134.81 });
    expect(schedule[0]!.invoices.map((item) => item.folio)).toEqual(['27846', '27847']);
  });

  it('un mes que se cerró sin factura queda por facturar', () => {
    const october = period({ status: 'expired', consumedHoursEnd: 4 });
    const november = period({ id: 'period-nov', startDate: utc('2026-11-01'), endDate: utc('2026-12-01'), reusedBalanceHours: 6 });
    const schedule = buildMonthlyBillingSchedule(plan(), [october, november], [], utc('2026-11-10'));
    expect(schedule.map((item) => [item.periodKey, item.status, item.isCurrent])).toEqual([
      ['2026-10', 'to_invoice', false],
      ['2026-11', 'to_invoice', true],
      ['2026-12', 'upcoming', false],
    ]);
  });

  it('un contrato sin fecha de término solo proyecta el próximo mes', () => {
    const schedule = buildMonthlyBillingSchedule(plan({ endDate: null }), [period()], [], utc('2026-10-29'));
    expect(schedule.map((item) => item.periodKey)).toEqual(['2026-10', '2026-11']);
  });

  it('un contrato cerrado no proyecta meses futuros', () => {
    const schedule = buildMonthlyBillingSchedule(plan({ status: 'ended' }), [period({ status: 'expired' })], [], utc('2026-10-29'));
    expect(schedule.map((item) => item.periodKey)).toEqual(['2026-10']);
  });

  it('bolsa y a demanda no tienen calendario mensual', () => {
    expect(buildMonthlyBillingSchedule(plan({ planType: 'bundle' }), [], [], utc('2026-10-29'))).toEqual([]);
  });
});
