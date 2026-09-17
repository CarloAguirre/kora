import { describe, expect, it } from 'vitest';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type {
  SupportMonthlyPeriodRecord,
  SupportPlanRecord,
  SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportBillingCalculator } from './support-billing-calculator';

/** Solo implementa lo que el calculador usa — el resto lanza si se llama por error. */
class FakeHourEntryRepository implements Pick<HourEntryRepository, 'sumApprovedHoursForProjects'> {
  constructor(private readonly hours: number) {}
  async sumApprovedHoursForProjects(): Promise<number> {
    return this.hours;
  }
}

class FakeSupportPlanRepository implements Pick<SupportPlanRepository, 'listPeriodsForPlan'> {
  constructor(private readonly periods: SupportMonthlyPeriodRecord[]) {}
  async listPeriodsForPlan(): Promise<SupportMonthlyPeriodRecord[]> {
    return this.periods;
  }
}

class FakeSupportInvoiceRepository implements Pick<SupportInvoiceRepository, 'sumHoursBilledForPlan'> {
  constructor(private readonly alreadyBilled: number) {}
  async sumHoursBilledForPlan(): Promise<number> {
    return this.alreadyBilled;
  }
}

function buildCalculator(hours: number, periods: SupportMonthlyPeriodRecord[] = [], alreadyBilled = 0): SupportBillingCalculator {
  return new SupportBillingCalculator(
    new FakeSupportPlanRepository(periods) as unknown as SupportPlanRepository,
    new FakeHourEntryRepository(hours) as unknown as HourEntryRepository,
    new FakeSupportInvoiceRepository(alreadyBilled) as unknown as SupportInvoiceRepository,
  );
}

function basePlan(overrides: Partial<SupportPlanRecord> = {}): SupportPlanRecord {
  return {
    id: 'plan-1',
    clientId: 'client-1',
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
  it('factura las horas aprobadas del mes en curso al valor hora del plan', async () => {
    const calculator = buildCalculator(10);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand', planValueUf: 0.35 }), ['p1'], TODAY);
    expect(result).toEqual({ amountUf: 3.5, hoursBilled: 10, periodKey: '2026-09', monthlyPeriodId: null });
  });

  it('no factura nada si no hay horas aprobadas este mes', async () => {
    const calculator = buildCalculator(0);
    const result = await calculator.calculate(basePlan({ planType: 'on_demand' }), ['p1'], TODAY);
    expect(result).toBeNull();
  });
});

describe('SupportBillingCalculator — bundle', () => {
  it('no factura nada si el uso no supera las horas contratadas', async () => {
    const calculator = buildCalculator(50, [], 0);
    const result = await calculator.calculate(basePlan({ planType: 'bundle', contractedHours: 300 }), ['p1'], TODAY);
    expect(result).toBeNull();
  });

  it('factura el excedente completo al valor de hora extra cuando nada se ha facturado antes', async () => {
    const calculator = buildCalculator(340, [], 0);
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

  it('no factura nada si no hay un período activo hoy', async () => {
    const calculator = buildCalculator(0, []);
    const result = await calculator.calculate(basePlan({ planType: 'monthly' }), [], TODAY);
    expect(result).toBeNull();
  });

  it('factura solo la cuota cuando el uso no supera el cupo del período', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 15, contractedHours: 20 })]);
    const result = await calculator.calculate(basePlan({ planType: 'monthly', planValueUf: 12 }), [], TODAY);
    expect(result).toEqual({ amountUf: 12, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('en el último período sin política acumulable, cobra el excedente como hora extra', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20, endDate: new Date('2026-10-01T00:00:00Z') })]);
    const plan = basePlan({
      planType: 'monthly',
      planValueUf: 12,
      extraHourValueUf: 0.5,
      surplusPolicy: 'expire',
      endDate: new Date('2026-09-30T00:00:00Z'),
    });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 16, hoursBilled: 8, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('con política acumulable, el excedente NUNCA se cobra como hora extra aunque sea el último período', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20, endDate: new Date('2026-10-01T00:00:00Z') })]);
    const plan = basePlan({
      planType: 'monthly',
      planValueUf: 12,
      surplusPolicy: 'accumulate',
      endDate: new Date('2026-09-30T00:00:00Z'),
    });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 12, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('no cobra excedente como hora extra si NO es el último período, aunque se exceda el cupo', async () => {
    const calculator = buildCalculator(0, [period({ consumedHoursPeriod: 28, contractedHours: 20 })]);
    const plan = basePlan({ planType: 'monthly', planValueUf: 12, surplusPolicy: 'expire', endDate: new Date('2027-01-01T00:00:00Z') });
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 12, hoursBilled: null, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });

  it('el saldo reutilizado solo amplía el cupo cuando la política es acumulable', async () => {
    const calculator = buildCalculator(
      0,
      [period({ consumedHoursPeriod: 25, contractedHours: 20, reusedBalanceHours: 10, endDate: new Date('2026-10-01T00:00:00Z') })],
    );
    const plan = basePlan({
      planType: 'monthly',
      planValueUf: 12,
      extraHourValueUf: 0.5,
      surplusPolicy: 'expire',
      endDate: new Date('2026-09-30T00:00:00Z'),
    });
    // Cupo real = 20 (el saldo reutilizado de 10h se ignora por ser política 'expire') → excedente = 25 - 20 = 5.
    const result = await calculator.calculate(plan, [], TODAY);
    expect(result).toEqual({ amountUf: 14.5, hoursBilled: 5, periodKey: '2026-09', monthlyPeriodId: 'period-1' });
  });
});
