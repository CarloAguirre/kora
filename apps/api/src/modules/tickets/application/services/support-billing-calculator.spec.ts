import { describe, expect, it } from 'vitest';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRecord, SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportBillingCalculator } from './support-billing-calculator';
import type { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';

/** Solo implementa lo que el calculador usa — el resto lanza si se llama por error. */
class FakeHourEntryRepository implements Pick<HourEntryRepository, 'sumApprovedHoursForProjects'> {
  constructor(private readonly hours: number) {}
  async sumApprovedHoursForProjects(): Promise<number> {
    return this.hours;
  }
}

class FakePeriodReconciler implements Pick<SupportMonthlyPeriodReconciler, 'listPeriods'> {
  constructor(private readonly periods: SupportMonthlyPeriodRecord[]) {}
  async listPeriods(): Promise<SupportMonthlyPeriodRecord[]> {
    return this.periods;
  }
}

class FakeSupportInvoiceRepository implements Pick<SupportInvoiceRepository, 'sumHoursBilledForPlan' | 'listForPlan'> {
  constructor(
    private readonly alreadyBilled: number,
    private readonly invoiceCount: number,
    private readonly invoices: SupportInvoiceRecord[] | null,
  ) {}
  async sumHoursBilledForPlan(): Promise<number> {
    return this.alreadyBilled;
  }
  async listForPlan(): Promise<SupportInvoiceRecord[]> {
    return this.invoices ?? Array.from({ length: this.invoiceCount }, () => ({}) as SupportInvoiceRecord);
  }
}

/** `invoiceCount` = facturas previas del plan; por defecto, 1 si ya hay horas facturadas (en una bolsa, la primera factura ya cobró la bolsa). */
function buildCalculator(
  hours: number,
  periods: SupportMonthlyPeriodRecord[] = [],
  alreadyBilled = 0,
  invoiceCount = alreadyBilled > 0 ? 1 : 0,
  invoices: SupportInvoiceRecord[] | null = null,
): SupportBillingCalculator {
  return new SupportBillingCalculator(
    new FakePeriodReconciler(periods) as unknown as SupportMonthlyPeriodReconciler,
    new FakeHourEntryRepository(hours) as unknown as HourEntryRepository,
    new FakeSupportInvoiceRepository(alreadyBilled, invoiceCount, invoices) as unknown as SupportInvoiceRepository,
  );
}

function basePlan(overrides: Partial<SupportPlanRecord> = {}): SupportPlanRecord {
  return {
    id: 'plan-1',
    clientId: 'client-1',
    slug: 'plan-1',
    projectId: null,
    planType: 'on_demand',
    scope: 'single',
    surplusPolicy: null,
    status: 'active',
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: null,
    contractedHours: 0,
    planValueUf: 0.35,
    extraHourValueUf: 0.45,
    currency: 'UF',
    name: null,
    leaderUserId: null,
    primaryContactId: null,
    quotationLink: null,
    contractLink: null,
    additionalLinks: null,
    dueDayOfMonth: null,
    targetHoursCritical: null,
    targetHoursHigh: null,
    targetHoursMedium: null,
    targetHoursLow: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const TODAY = new Date('2026-09-15T12:00:00Z');

describe('SupportBillingCalculator — on_demand', () => {
  it('factura las horas aprobadas aún no facturadas al valor hora del plan', async () => {
    const calculator = buildCalculator(10);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand', planValueUf: 0.35 }), ['p1'], TODAY);
    expect(result).toEqual({ amountUf: 3.5, hoursBilled: 10, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('descuenta las horas que ya entraron en facturas anteriores — las de un mes cerrado sin facturar siguen por cobrar', async () => {
    const calculator = buildCalculator(26.75, [], 12);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand', planValueUf: 0.4 }), ['p1'], TODAY);
    expect(result).toEqual({ amountUf: 5.9, hoursBilled: 14.75, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('no factura nada si todas las horas aprobadas ya se facturaron', async () => {
    const calculator = buildCalculator(10, [], 10);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand' }), ['p1'], TODAY);
    expect(result).toBeNull();
  });

  it('no factura nada si no hay horas aprobadas', async () => {
    const calculator = buildCalculator(0);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand' }), ['p1'], TODAY);
    expect(result).toBeNull();
  });
});

describe('SupportBillingCalculator — bundle', () => {
  it('la primera factura cobra la bolsa completa (HH contratadas × valor hora) aunque no se haya usado', async () => {
    const calculator = buildCalculator(0, [], 0);
    const result = await calculator.calculate(basePlan({ planType: 'bundle', contractedHours: 300, planValueUf: 0.35 }), ['p1'], TODAY);
    expect(result).toEqual({ amountUf: 105, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('no vuelve a cobrar la bolsa si ya tiene una factura y el uso no supera las horas contratadas', async () => {
    const calculator = buildCalculator(50, [], 0, 1);
    const result = await calculator.calculate(basePlan({ planType: 'bundle', contractedHours: 300 }), ['p1'], TODAY);
    expect(result).toBeNull();
  });

  it('si la bolsa aún no se factura y ya hay excedente, cobra ambos en la misma factura', async () => {
    const calculator = buildCalculator(340, [], 0);
    const result = await calculator.calculate(
      basePlan({ planType: 'bundle', contractedHours: 300, planValueUf: 0.35, extraHourValueUf: 0.45 }),
      ['p1'],
      TODAY,
    );
    expect(result).toEqual({ amountUf: 123, hoursBilled: 40, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('con la bolsa ya facturada, cobra el excedente completo al valor de hora extra', async () => {
    const calculator = buildCalculator(340, [], 0, 1);
    const result = await calculator.calculate(
      basePlan({ planType: 'bundle', contractedHours: 300, extraHourValueUf: 0.45 }),
      ['p1'],
      TODAY,
    );
    expect(result).toEqual({ amountUf: 18, hoursBilled: 40, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('solo factura el excedente NUEVO — no vuelve a cobrar horas ya facturadas en una factura anterior', async () => {
    const calculator = buildCalculator(340, [], 25);
    const result = await calculator.calculate(
      basePlan({ planType: 'bundle', contractedHours: 300, extraHourValueUf: 0.45 }),
      ['p1'],
      TODAY,
    );
    expect(result).toEqual({ amountUf: 6.75, hoursBilled: 15, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('no factura nada si el excedente ya fue facturado por completo', async () => {
    const calculator = buildCalculator(340, [], 40);
    const result = await calculator.calculate(basePlan({ planType: 'bundle', contractedHours: 300 }), ['p1'], TODAY);
    expect(result).toBeNull();
  });
});

describe('SupportBillingCalculator — monthly', () => {
  const period = (overrides: Partial<SupportMonthlyPeriodRecord> = {}): SupportMonthlyPeriodRecord => ({
    id: 'period-1',
    planId: 'plan-1',
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-10-01T00:00:00Z'),
    contractedHours: 20,
    consumedHoursPeriod: 15,
    surplusHours: 0,
    status: 'active',
    reusedBalanceHours: 0,
    consumedHoursStart: 0,
    consumedHoursEnd: null,
    ...overrides,
  });

  const invoice = (overrides: Partial<SupportInvoiceRecord> = {}): SupportInvoiceRecord => ({
    id: 'invoice-x',
    planId: 'plan-1',
    periodKey: '2026-01',
    amountUf: 0,
    currency: 'UF',
    hoursBilled: null,
    position: 0,
    folio: '1',
    invoicedAt: new Date('2026-01-01T00:00:00Z'),
    dueAt: null,
    paidAt: null,
    attachmentName: null,
    monthlyPeriodId: null,
    ...overrides,
  });

  it('no factura nada si no hay un período activo hoy', async () => {
    const calculator = buildCalculator(0, []);
    const result = await calculator.calculate(basePlan({ planType: 'monthly' }), [], TODAY);
    expect(result).toBeNull();
  });

  it('factura solo la cuota (HH del período × valor hora) cuando el uso no supera el cupo', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 15, contractedHours: 20 })]);
    const result = await calculator.calculate(basePlan({ planType: 'monthly', planValueUf: 0.6 }), [], TODAY);
    expect(result).toEqual({ amountUf: 12, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('en el último período sin política acumulable, cobra el excedente como hora extra', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20, endDate: new Date('2026-10-01T00:00:00Z') })]);
    const plan = basePlan({
      planType: 'monthly',
      planValueUf: 0.6,
      extraHourValueUf: 0.5,
      surplusPolicy: 'expire',
      endDate: new Date('2026-09-30T00:00:00Z'),
    });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 16, hoursBilled: 8, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('con política acumulable también cobra el exceso como hora extra — sobre las HH del mes más el saldo acumulado', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20, reusedBalanceHours: 5 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'accumulate' });
    const result = await calculator.calculate(plan, [], TODAY);
    // Cupo = 20 + 5 acumuladas → excedente 3 × 0,5 = 1,5 sobre la cuota de 12.
    expect(result).toEqual({ amountUf: 13.5, hoursBilled: 3, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('caso Tierra Viva (acumulable, sin saldo previo): 10 HH a 25 y 18,5 usadas → 250 + 8,5 × 25 = 462,5', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 18.5, contractedHours: 10 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 25, extraHourValueUf: 25, currency: 'USD', surplusPolicy: 'accumulate' });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 462.5, hoursBilled: 8.5, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('sin política acumulable cobra el excedente de cada mes como hora extra, aunque NO sea el último período', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire', endDate: new Date('2027-01-01T00:00:00Z') });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 16, hoursBilled: 8, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('caso Tierra Viva: 10 HH incluidas a 25, 23 HH usadas → cuota 250 + 13 HH extra a 25 = 575', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 23, contractedHours: 10 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 25, extraHourValueUf: 25, currency: 'USD', surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 575, hoursBilled: 13, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('suma el excedente de meses anteriores que quedó sin cobrar (horas registradas después de facturarlos)', async () => {
    const august = period({
      id: 'period-0',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
      status: 'expired',
      consumedHoursPeriod: 26,
    });
    // Agosto se facturó a mitad de mes con 2 HH de excedente; al cerrar tenía 6. Septiembre: 23 de 20 → 3.
    const calculator = buildCalculator(0, [august, period({ consumedHoursPeriod: 23 })], 0, 0, [invoice({ monthlyPeriodId: 'period-0', hoursBilled: 2 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    // Excedente acumulado 6 + 3 = 9, ya cobradas 2 → 7 HH × 0,5 = 3,5 sobre la cuota de 12.
    expect(result).toEqual({ amountUf: 15.5, hoursBilled: 7, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('no vuelve a cobrar el excedente del mes anterior que ya entró en su factura', async () => {
    const august = period({
      id: 'period-0',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
      status: 'expired',
      consumedHoursPeriod: 28,
    });
    const calculator = buildCalculator(0, [august, period({ consumedHoursPeriod: 20 })], 0, 0, [invoice({ monthlyPeriodId: 'period-0', hoursBilled: 8 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 12, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('el excedente del mes anterior que cobró la factura de este mes no se descuenta del excedente de este mes', async () => {
    // Jul: 25 (5 extra) facturado sin excedente; Ago: 24 (4 extra) facturado con las 5 de julio; Sep: 22 (2 extra).
    const july = period({ id: 'p-jul', startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 25 });
    const august = period({ id: 'p-ago', startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-09-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 24 });
    const calculator = buildCalculator(0, [july, august, period({ consumedHoursPeriod: 22 })], 0, 0, [
      invoice({ monthlyPeriodId: 'p-jul', hoursBilled: null }),
      invoice({ monthlyPeriodId: 'p-ago', hoursBilled: 5 }),
    ]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    // Agosto (4) + septiembre (2) = 6 HH × 0,5 = 3 sobre la cuota de 12.
    expect(result).toEqual({ amountUf: 15, hoursBilled: 6, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('un mes con el total dividido en varias facturas descuenta las horas de todas ellas', async () => {
    const july = period({ id: 'p-jul', startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 25 });
    const august = period({ id: 'p-ago', startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-09-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 24 });
    const calculator = buildCalculator(0, [july, august, period({ consumedHoursPeriod: 22 })], 0, 0, [
      invoice({ monthlyPeriodId: 'p-jul', hoursBilled: null }),
      invoice({ id: 'ago-1', monthlyPeriodId: 'p-ago', hoursBilled: 5, position: 0 }),
      invoice({ id: 'ago-2', monthlyPeriodId: 'p-ago', hoursBilled: null, position: 1 }),
    ]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 15, hoursBilled: 6, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('no arrastra excedente de meses anteriores al mes previo (ya conciliados)', async () => {
    const june = period({ id: 'p-jun', startDate: new Date('2026-06-01T00:00:00Z'), endDate: new Date('2026-07-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 60 });
    const july = period({ id: 'p-jul', startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 20 });
    const august = period({ id: 'p-ago', startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-09-01T00:00:00Z'), status: 'expired', consumedHoursPeriod: 20 });
    const calculator = buildCalculator(0, [june, july, august, period({ consumedHoursPeriod: 21 })], 0, 0, []);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 12.5, hoursBilled: 1, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('al facturar un mes cerrado no cuenta el excedente de meses posteriores', async () => {
    const august = period({
      id: 'period-0',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
      status: 'expired',
      consumedHoursPeriod: 22,
    });
    const calculator = buildCalculator(0, [august, period({ consumedHoursPeriod: 30 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 0.6, extraHourValueUf: 0.5, surplusPolicy: 'expire' });
    const result = await calculator.calculate(plan, [], TODAY, { monthlyPeriodId: 'period-0' });
    expect(result).toEqual({ amountUf: 13, hoursBilled: 2, periodKey: '2026-08', monthlyPeriodId: 'period-0' });
  });

  it('el saldo reutilizado solo amplía el cupo cuando la política es acumulable', async () => {
    const calculator = buildCalculator(
      0,
      [period({ consumedHoursPeriod: 25, contractedHours: 20, reusedBalanceHours: 10, endDate: new Date('2026-10-01T00:00:00Z') })],
    );
    const plan = basePlan({
      planType: 'monthly',
      planValueUf: 0.6,
      extraHourValueUf: 0.5,
      surplusPolicy: 'expire',
      endDate: new Date('2026-09-30T00:00:00Z'),
    });
    // Cupo real = 20 (el saldo reutilizado de 10h se ignora por ser política 'expire') → excedente = 25 - 20 = 5.
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 14.5, hoursBilled: 5, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });
  it('con monthlyPeriodId factura un período ya cerrado que quedó sin factura', async () => {
    const august = period({
      id: 'period-0',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
      status: 'expired',
      contractedHours: 10,
      consumedHoursPeriod: 10,
    });
    const calculator = buildCalculator(0, [august, period()]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 25, surplusPolicy: 'accumulate' });
    const result = await calculator.calculate(plan, [], TODAY, { monthlyPeriodId: 'period-0' });
    expect(result).toEqual({ amountUf: 250, hoursBilled: null, periodKey: '2026-08', monthlyPeriodId: 'period-0' });
  });

  it('no factura un período que todavía no empieza', async () => {
    const october = period({ id: 'period-2', startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-11-01T00:00:00Z') });
    const calculator = buildCalculator(0, [period(), october]);
    const result = await calculator.calculate(basePlan({ planType: 'monthly', planValueUf: 0.6 }), [], TODAY, { monthlyPeriodId: 'period-2' });
    expect(result).toBeNull();
  });
});
