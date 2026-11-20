import { describe, expect, it, vi } from 'vitest';
import type { SupportProjectSummary } from '@kora/contracts';
import { ListSupportProjectUsageUseCase } from './list-support-project-usage.use-case';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { FixedClock } from '../../../../test/fakes';

const NOW = new Date('2026-11-18T12:00:00.000Z');

const baseSummary = { planValueUf: 0, extraHourValueUf: 0, currency: 'UF' as const, history: [] };

function setup(
  summaries: Record<string, SupportProjectSummary | null>,
  participants: ReadonlySet<string> = new Set(),
  monthHours = 0,
  planDates: Partial<Pick<SupportPlanRecord, 'startDate' | 'endDate'>> = {},
) {
  const plans = {
    findActiveForProjectOrLinked: vi.fn(async (projectId: string) => {
      const summary = summaries[projectId];
      if (!summary) return null;
      return {
        id: `plan-${projectId}`,
        planType: summary.planType,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        ...planDates,
      } as SupportPlanRecord;
    }),
  };
  const hourEntries = { sumApprovedHoursForProjects: vi.fn().mockResolvedValue(monthHours) };
  const projects = { isParticipant: vi.fn(async (projectId: string) => participants.has(projectId)) };
  const builder = {
    resolveLinkedProjectIds: vi.fn().mockResolvedValue(['linked']),
    build: vi.fn(async (plan: SupportPlanRecord) => summaries[plan.id.replace('plan-', '')]!),
  };
  const useCase = new ListSupportProjectUsageUseCase(
    plans as unknown as SupportPlanRepository,
    projects as unknown as TicketProjectReader,
    builder as unknown as SupportPlanSummaryBuilder,
    hourEntries as unknown as HourEntryRepository,
    new FixedClock(NOW),
  );
  return { useCase, projects, hourEntries };
}

describe('ListSupportProjectUsageUseCase', () => {
  it('mensual: compara el mes en curso (plan + acumuladas), no las HH de un mes contra todo el historial', async () => {
    const { useCase } = setup({
      pdc: {
        ...baseSummary,
        planType: 'monthly',
        contractedHours: 50,
        usedHours: 639.45,
        availableHours: 102.55,
        currentPeriod: { usedHours: 192, capacityHours: 102.55, remainingHours: 0, planHours: 50, priorSurplusHours: 52.55 },
      },
    });

    const result = await useCase.execute({ projectIds: ['pdc'], actorUserId: 'u', actorPermissions: ['projects:read'] });

    expect(result.isOk() && result.value).toEqual([
      { projectId: 'pdc', planType: 'monthly', scope: 'month', planHours: 50, priorSurplusHours: 52.55, usedHours: 192, remainingHours: 0, deviationHours: 89.45, monthUsedHours: 192, contractUsedHours: 639.45 },
    ]);
  });

  it('bolsa: usa el consumo dentro de la vigencia del contrato y suma aparte el del mes en curso', async () => {
    const { useCase, hourEntries } = setup(
      { sol: { ...baseSummary, planType: 'bundle', contractedHours: 20, usedHours: 4, availableHours: 16, currentPeriod: null } },
      new Set(),
      1.5,
    );

    const result = await useCase.execute({ projectIds: ['sol'], actorUserId: 'u', actorPermissions: ['projects:read'] });

    expect(result.isOk() && result.value).toEqual([
      {
        projectId: 'sol',
        planType: 'bundle',
        scope: 'contract',
        planHours: 20,
        priorSurplusHours: 0,
        usedHours: 4,
        remainingHours: 16,
        deviationHours: 0,
        monthUsedHours: 1.5,
        contractUsedHours: 4,
      },
    ]);
    expect(hourEntries.sumApprovedHoursForProjects).toHaveBeenCalledWith(
      ['linked'],
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-30T00:00:00.000Z'),
    );
  });

  it('bolsa: el mes en curso se acota a la vigencia (contrato que empezó a mitad de mes)', async () => {
    const { useCase, hourEntries } = setup(
      { sol: { ...baseSummary, planType: 'bundle', contractedHours: 20, usedHours: 4, availableHours: 16, currentPeriod: null } },
      new Set(),
      0,
      { startDate: new Date('2026-11-10T00:00:00.000Z') },
    );

    await useCase.execute({ projectIds: ['sol'], actorUserId: 'u', actorPermissions: ['projects:read'] });

    expect(hourEntries.sumApprovedHoursForProjects).toHaveBeenCalledWith(
      ['linked'],
      new Date('2026-11-10T00:00:00.000Z'),
      new Date('2026-11-30T00:00:00.000Z'),
    );
  });

  it('a demanda: sin tope — vendidas, restantes, desviadas y el desglose mes/total en null', async () => {
    const { useCase } = setup({
      od: { ...baseSummary, planType: 'on_demand', contractedHours: 0, usedHours: 7, availableHours: null, currentPeriod: null },
    });

    const result = await useCase.execute({ projectIds: ['od'], actorUserId: 'u', actorPermissions: ['projects:read'] });

    expect(result.isOk() && result.value).toMatchObject([
      { planHours: null, usedHours: 7, remainingHours: null, deviationHours: null, monthUsedHours: null, contractUsedHours: null },
    ]);
  });

  it('omite proyectos sin contrato activo y, sin projects:read, los que el actor no integra', async () => {
    const bundle = { ...baseSummary, planType: 'bundle', contractedHours: 10, usedHours: 1, availableHours: 9, currentPeriod: null } satisfies SupportProjectSummary;
    const { useCase } = setup({ mine: bundle, other: bundle, closed: null }, new Set(['mine', 'closed']));

    const result = await useCase.execute({
      projectIds: ['mine', 'other', 'closed'],
      actorUserId: 'leader',
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isOk() && result.value.map((usage) => usage.projectId)).toEqual(['mine']);
  });
});
