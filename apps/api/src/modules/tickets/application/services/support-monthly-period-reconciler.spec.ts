import { describe, expect, it } from 'vitest';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type {
  CreateNextSupportMonthlyPeriodInput,
  SupportMonthlyPeriodRecord,
  SupportMonthlyPeriodUsageUpdate,
  SupportPlanRecord,
  SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { PassthroughUnitOfWork, SequentialIdGenerator } from '../../../../test/fakes';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';

type PlanRepositoryUsed = Pick<SupportPlanRepository, 'listPeriodsForPlan' | 'listLinkedProjectIds' | 'createNextPeriod' | 'updatePeriodUsage'>;

/** Guarda los períodos en memoria, con el mismo índice único (plan + inicio) que la tabla real. */
class InMemoryPeriods implements PlanRepositoryUsed {
  constructor(public periods: SupportMonthlyPeriodRecord[]) {}

  async listPeriodsForPlan(): Promise<SupportMonthlyPeriodRecord[]> {
    return this.periods.map((period) => ({ ...period }));
  }

  async listLinkedProjectIds(): Promise<string[]> {
    return ['project-1'];
  }

  async createNextPeriod(input: CreateNextSupportMonthlyPeriodInput): Promise<boolean> {
    if (this.periods.some((period) => period.status !== 'cancelled' && period.startDate.getTime() === input.startDate.getTime())) return false;
    this.periods.push({
      id: input.id,
      planId: input.planId,
      startDate: input.startDate,
      endDate: input.endDate,
      contractedHours: input.contractedHours,
      reusedBalanceHours: input.reusedBalanceHours,
      consumedHoursStart: input.consumedHoursStart,
      consumedHoursPeriod: 0,
      consumedHoursEnd: null,
      surplusHours: 0,
      status: 'active',
    });
    return true;
  }

  async updatePeriodUsage(periodId: string, usage: SupportMonthlyPeriodUsageUpdate): Promise<void> {
    this.periods = this.periods.map((period) => (period.id === periodId ? { ...period, ...usage } : period));
  }

  sorted(): SupportMonthlyPeriodRecord[] {
    return [...this.periods].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
}

/** Horas aprobadas por fecha — la suma respeta el rango [desde, hasta] inclusivo, igual que el repositorio real. */
class FakeHourEntries implements Pick<HourEntryRepository, 'sumApprovedHoursForProjects'> {
  constructor(private readonly entries: { date: string; hours: number }[]) {}

  async sumApprovedHoursForProjects(_projectIds: readonly string[], from: Date, to: Date): Promise<number> {
    return this.entries
      .filter((entry) => new Date(`${entry.date}T00:00:00Z`) >= from && new Date(`${entry.date}T00:00:00Z`) <= to)
      .reduce((sum, entry) => sum + entry.hours, 0);
  }
}

function build(periods: SupportMonthlyPeriodRecord[], entries: { date: string; hours: number }[] = []) {
  const repository = new InMemoryPeriods(periods);
  const reconciler = new SupportMonthlyPeriodReconciler(
    repository as unknown as SupportPlanRepository,
    new FakeHourEntries(entries) as unknown as HourEntryRepository,
    new PassthroughUnitOfWork(),
    new SequentialIdGenerator('period'),
  );
  return { repository, reconciler };
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function plan(overrides: Partial<SupportPlanRecord> = {}): SupportPlanRecord {
  return {
    id: 'plan-1',
    clientId: 'client-1',
    slug: 'plan-1',
    projectId: null,
    planType: 'monthly',
    scope: 'single',
    surplusPolicy: 'accumulate',
    status: 'active',
    startDate: d('2026-07-01'),
    endDate: null,
    contractedHours: 10,
    planValueUf: 8,
    extraHourValueUf: 1.1,
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
    createdAt: d('2026-07-01'),
    updatedAt: d('2026-07-01'),
    ...overrides,
  };
}

function period(overrides: Partial<SupportMonthlyPeriodRecord> = {}): SupportMonthlyPeriodRecord {
  return {
    id: 'aug',
    planId: 'plan-1',
    startDate: d('2026-08-01'),
    endDate: d('2026-09-01'),
    contractedHours: 10,
    reusedBalanceHours: 0,
    consumedHoursStart: 0,
    consumedHoursPeriod: 0,
    consumedHoursEnd: null,
    surplusHours: 0,
    status: 'active',
    ...overrides,
  };
}

const TODAY = new Date('2026-09-15T12:00:00Z');

describe('SupportMonthlyPeriodReconciler — renovación del período', () => {
  it('cierra el período vencido y abre el del mes en curso', async () => {
    const { repository, reconciler } = build([period()], [{ date: '2026-08-20', hours: 6 }]);

    const periods = await reconciler.listPeriods(plan(), TODAY);

    expect(periods).toHaveLength(2);
    const [august, september] = repository.sorted();
    expect(august).toMatchObject({ status: 'expired', consumedHoursPeriod: 6, consumedHoursEnd: 6, surplusHours: 4 });
    expect(september).toMatchObject({ status: 'active', startDate: d('2026-09-01'), endDate: d('2026-10-01'), contractedHours: 10, consumedHoursStart: 6 });
  });

  it('acumulable: el sobrante del período cerrado pasa como saldo reutilizado del siguiente', async () => {
    const { repository, reconciler } = build([period({ reusedBalanceHours: 5 })], [{ date: '2026-08-20', hours: 12 }]);

    await reconciler.listPeriods(plan({ surplusPolicy: 'accumulate' }), TODAY);

    // 10 contratadas + 5 de saldo − 12 consumidas = 3 h que pasan a septiembre.
    const [august, september] = repository.sorted();
    expect(august?.surplusHours).toBe(3);
    expect(september?.reusedBalanceHours).toBe(3);
  });

  it('con vencimiento: el sobrante se pierde', async () => {
    const { repository, reconciler } = build([period({ reusedBalanceHours: 5 })], [{ date: '2026-08-20', hours: 2 }]);

    await reconciler.listPeriods(plan({ surplusPolicy: 'expire' }), TODAY);

    const [august, september] = repository.sorted();
    expect(august?.surplusHours).toBe(8);
    expect(september?.reusedBalanceHours).toBe(0);
  });

  it('el saldo nunca queda negativo aunque el consumo supere la capacidad', async () => {
    const { repository, reconciler } = build([period({ reusedBalanceHours: 2 })], [{ date: '2026-08-20', hours: 30 }]);

    await reconciler.listPeriods(plan(), TODAY);

    expect(repository.sorted()[1]?.reusedBalanceHours).toBe(0);
  });

  it('pone al día varios meses de una vez, encadenando los saldos', async () => {
    const { repository, reconciler } = build(
      [period({ id: 'jun', startDate: d('2026-06-01'), endDate: d('2026-07-01') })],
      [
        { date: '2026-06-10', hours: 4 },
        { date: '2026-07-10', hours: 9 },
        { date: '2026-08-10', hours: 15 },
      ],
    );

    await reconciler.listPeriods(plan({ startDate: d('2026-06-01') }), TODAY);

    const chain = repository.sorted();
    expect(chain.map((p) => [p.startDate.toISOString().slice(0, 10), p.status, p.reusedBalanceHours])).toEqual([
      ['2026-06-01', 'expired', 0],
      ['2026-07-01', 'expired', 6], // 10 − 4
      ['2026-08-01', 'expired', 7], // 10 + 6 − 9
      ['2026-09-01', 'active', 2], // 10 + 7 − 15
    ]);
    expect(chain.at(-1)?.consumedHoursStart).toBe(28);
  });

  it('no abre un período nuevo cuando el contrato ya terminó: solo cierra el último', async () => {
    const { repository, reconciler } = build([period()]);

    await reconciler.listPeriods(plan({ endDate: d('2026-09-01') }), TODAY);

    expect(repository.sorted()).toHaveLength(1);
    expect(repository.sorted()[0]?.status).toBe('expired');
  });

  it('no toca contratos que no son mensuales ni contratos ya terminados', async () => {
    for (const other of [plan({ planType: 'bundle' }), plan({ status: 'ended' })]) {
      const { repository, reconciler } = build([period()]);
      await reconciler.listPeriods(other, TODAY);
      expect(repository.sorted()).toEqual([period()]);
    }
  });

  it('ignora los períodos anulados al buscar el último de la cadena', async () => {
    const { repository, reconciler } = build([
      period(),
      period({ id: 'cancelled', startDate: d('2026-08-02'), endDate: d('2026-09-02'), status: 'cancelled' }),
    ]);

    await reconciler.listPeriods(plan(), TODAY);

    expect(repository.sorted().find((p) => p.id === 'aug')?.status).toBe('expired');
    expect(repository.sorted().some((p) => p.startDate.getTime() === d('2026-09-01').getTime())).toBe(true);
  });

  it('si otro request ya abrió el período siguiente, no lo duplica', async () => {
    const { repository, reconciler } = build([period()]);
    // Simula la carrera: el período de septiembre aparece recién al intentar insertarlo.
    const originalCreate = repository.createNextPeriod.bind(repository);
    repository.createNextPeriod = async (input) => {
      repository.periods.push(period({ id: 'sep-other', startDate: input.startDate, endDate: input.endDate }));
      return originalCreate(input);
    };

    await reconciler.listPeriods(plan(), TODAY);

    expect(repository.periods.filter((p) => p.status !== 'cancelled' && p.startDate.getTime() === d('2026-09-01').getTime())).toHaveLength(1);
  });
});

describe('SupportMonthlyPeriodReconciler — consumo del período vigente', () => {
  it('recalcula el consumo con las horas aprobadas del período', async () => {
    const { repository, reconciler } = build(
      [period({ id: 'sep', startDate: d('2026-09-01'), endDate: d('2026-10-01'), reusedBalanceHours: 3 })],
      [
        { date: '2026-08-31', hours: 50 }, // Fuera del período.
        { date: '2026-09-02', hours: 4 },
        { date: '2026-09-10', hours: 2.5 },
      ],
    );

    const periods = await reconciler.listPeriods(plan(), TODAY);

    expect(periods[0]).toMatchObject({ status: 'active', consumedHoursPeriod: 6.5, consumedHoursEnd: null, surplusHours: 6.5 });
    expect(repository.sorted()).toHaveLength(1);
  });

  it('no incluye el día en que empieza el período siguiente', async () => {
    const { reconciler } = build([period({ id: 'sep', startDate: d('2026-09-01'), endDate: d('2026-10-01') })], [{ date: '2026-10-01', hours: 5 }]);

    const periods = await reconciler.listPeriods(plan(), TODAY);

    expect(periods[0]?.consumedHoursPeriod).toBe(0);
  });
});
