import { describe, expect, it } from 'vitest';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import { computeSupportPlanAlerts } from './support-plan-alerts';

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
    planValueUf: 0,
    extraHourValueUf: 0,
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

function period(overrides: Partial<SupportMonthlyPeriodRecord> = {}): SupportMonthlyPeriodRecord {
  return {
    id: 'period-1',
    planId: 'plan-1',
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-10-01T00:00:00Z'),
    contractedHours: 20,
    consumedHoursPeriod: 10,
    surplusHours: 0,
    status: 'active',
    reusedBalanceHours: 0,
    consumedHoursStart: 0,
    consumedHoursEnd: null,
    ...overrides,
  };
}

const TODAY = new Date('2026-09-15T12:00:00Z');

describe('computeSupportPlanAlerts', () => {
  it('sin alertas para un plan sin desviaciones ni vencimientos', () => {
    const alerts = computeSupportPlanAlerts(basePlan({ planType: 'bundle', contractedHours: 300 }), [], 100, TODAY);
    expect(alerts).toEqual([]);
  });

  it('"horas desviadas" cuando un plan bundle supera las horas contratadas', () => {
    const alerts = computeSupportPlanAlerts(basePlan({ planType: 'bundle', contractedHours: 300 }), [], 340, TODAY);
    expect(alerts).toEqual([{ type: 'deviated_hours', daysUntilExpiry: null }]);
  });

  it('no marca "horas desviadas" en un plan on_demand (no aplica, no tiene tope)', () => {
    const alerts = computeSupportPlanAlerts(basePlan({ planType: 'on_demand' }), [], 99999, TODAY);
    expect(alerts).toEqual([]);
  });

  it('"último mes con excedente" cuando el último período (sin acumulable) excede su cupo', () => {
    const plan = basePlan({ planType: 'monthly', surplusPolicy: 'expire', endDate: new Date('2026-09-30T00:00:00Z') });
    const alerts = computeSupportPlanAlerts(
      plan,
      [period({ consumedHoursPeriod: 28, contractedHours: 20, endDate: new Date('2026-10-01T00:00:00Z') })],
      0,
      TODAY,
    );
    expect(alerts).toEqual([{ type: 'last_period_overage', daysUntilExpiry: null }]);
  });

  it('no marca "último mes con excedente" si el período activo no es el último del contrato', () => {
    const plan = basePlan({ planType: 'monthly', surplusPolicy: 'expire', endDate: new Date('2027-06-30T00:00:00Z') });
    const alerts = computeSupportPlanAlerts(plan, [period({ consumedHoursPeriod: 28, contractedHours: 20 })], 0, TODAY);
    expect(alerts).toEqual([]);
  });

  it('"cupo por vencer" cuando el saldo acumulado vence dentro del umbral', () => {
    const plan = basePlan({ planType: 'monthly', surplusPolicy: 'accumulate' });
    // Período activo empezó hace ~11 meses → el saldo acumulado (regla de 1 año) vence en ~30 días.
    const activeStart = new Date(TODAY);
    activeStart.setUTCFullYear(activeStart.getUTCFullYear() - 1);
    activeStart.setUTCDate(activeStart.getUTCDate() + 30);
    const alerts = computeSupportPlanAlerts(
      plan,
      [period({ startDate: activeStart, endDate: new Date('2099-01-01T00:00:00Z'), reusedBalanceHours: 5 })],
      0,
      TODAY,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe('quota_expiring');
    expect(alerts[0]!.daysUntilExpiry).toBeGreaterThanOrEqual(0);
    expect(alerts[0]!.daysUntilExpiry).toBeLessThanOrEqual(60);
  });

  it('no marca "cupo por vencer" si no hay saldo acumulado en el período activo', () => {
    const plan = basePlan({ planType: 'monthly', surplusPolicy: 'accumulate' });
    const alerts = computeSupportPlanAlerts(plan, [period({ reusedBalanceHours: 0 })], 0, TODAY);
    expect(alerts).toEqual([]);
  });

  it('no marca "cupo por vencer" si el vencimiento está lejos en el tiempo', () => {
    const plan = basePlan({ planType: 'monthly', surplusPolicy: 'accumulate' });
    const alerts = computeSupportPlanAlerts(plan, [period({ startDate: new Date('2026-09-01T00:00:00Z'), reusedBalanceHours: 5 })], 0, TODAY);
    expect(alerts).toEqual([]);
  });
});
