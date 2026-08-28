import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportProjectSummary } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportMonthlyPeriodRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetSupportPlanSummaryCommand {
  readonly projectId: string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const HOUR_ENTRY_PAGE_SIZE = 2000;

/**
 * "Estado del proyecto" + "Historial de progreso" de `FichaProyectoSoporte`
 * en la v1. Los planes mensuales resetean capacidad por período
 * (`support_monthly_periods`); bolsa/a demanda no tienen períodos, así que
 * su historial se arma agrupando horas aprobadas por mes.
 */
@Injectable()
export class GetSupportPlanSummaryUseCase implements UseCase<GetSupportPlanSummaryCommand, SupportProjectSummary | null, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GetSupportPlanSummaryCommand): Promise<Result<SupportProjectSummary | null, ApplicationError>> {
    const plan = await this.plans.findActiveForProject(command.projectId);
    if (!plan) return ok(null);

    if (plan.planType === 'monthly') {
      return ok(await this.buildMonthlySummary(plan.id, plan.contractedHours, plan.surplusPolicy === 'accumulate'));
    }

    return ok(await this.buildUsageSummary(command.projectId, plan.planType, plan.contractedHours));
  }

  private async buildMonthlySummary(
    planId: string,
    contractedHours: number,
    isAccumulate: boolean,
  ): Promise<SupportProjectSummary> {
    const periods = (await this.plans.listPeriodsForPlan(planId)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const now = this.clock.now();

    const priorSurplusOf = (period: SupportMonthlyPeriodRecord) => {
      if (!isAccumulate) return 0;
      const prior = periods.find((candidate) => candidate.endDate.getTime() === period.startDate.getTime());
      return prior?.surplusHours ?? 0;
    };

    const current = periods.find(
      (period) => period.status === 'active' && period.startDate <= now && now < period.endDate,
    );

    const currentPeriod = current
      ? (() => {
          const capacityHours = current.contractedHours + priorSurplusOf(current);
          return {
            usedHours: current.consumedHoursPeriod,
            capacityHours,
            remainingHours: Math.max(capacityHours - current.consumedHoursPeriod, 0),
          };
        })()
      : null;

    const monthLabelCounts = new Map<string, number>();
    for (const period of periods) {
      const label = MONTH_LABELS[period.startDate.getUTCMonth()]!;
      monthLabelCounts.set(label, (monthLabelCounts.get(label) ?? 0) + 1);
    }
    const monthLabelSeen = new Map<string, number>();
    const nextLabelFor = (period: SupportMonthlyPeriodRecord) => {
      const base = MONTH_LABELS[period.startDate.getUTCMonth()]!;
      if ((monthLabelCounts.get(base) ?? 0) <= 1) return base;
      const occurrence = (monthLabelSeen.get(base) ?? 0) + 1;
      monthLabelSeen.set(base, occurrence);
      return `${base} (${occurrence})`;
    };

    return {
      planType: 'monthly',
      contractedHours,
      usedHours: periods.reduce((sum, period) => sum + period.consumedHoursPeriod, 0),
      availableHours: currentPeriod?.capacityHours ?? null,
      currentPeriod,
      history: periods.map((period) => ({
        label: nextLabelFor(period),
        contractedHours: period.contractedHours,
        priorSurplusHours: priorSurplusOf(period),
        usedHours: period.consumedHoursPeriod,
      })),
    };
  }

  private async buildUsageSummary(
    projectId: string,
    planType: 'bundle' | 'on_demand',
    contractedHours: number,
  ): Promise<SupportProjectSummary> {
    const page = await this.hourEntries.search(
      { projectId, status: 'approved' },
      { page: 1, pageSize: HOUR_ENTRY_PAGE_SIZE },
      { field: 'date', direction: 'asc' },
    );

    const byMonth = new Map<string, number>();
    for (const entry of page.items) {
      const key = `${entry.date.getUTCFullYear()}-${entry.date.getUTCMonth()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + entry.hours);
    }

    const usedHours = page.items.reduce((sum, entry) => sum + entry.hours, 0);

    return {
      planType,
      contractedHours,
      usedHours,
      availableHours: planType === 'bundle' ? Math.max(contractedHours - usedHours, 0) : null,
      currentPeriod: null,
      history: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, hours]) => ({
          label: MONTH_LABELS[Number(key.split('-')[1])]!,
          contractedHours: null,
          priorSurplusHours: null,
          usedHours: hours,
        })),
    };
  }
}
