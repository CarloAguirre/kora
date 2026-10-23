import { Inject, Injectable } from '@nestjs/common';
import type { SupportProjectSummary } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportMonthlyPeriodRecord,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';
import { resolveSupportPlanHourProjectIds, resolveSupportPlanProjectIds } from './support-plan-linked-projects';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const HOUR_ENTRY_PAGE_SIZE = 2000;

/**
 * "Estado del proyecto" + "Historial de progreso" de `FichaProyectoSoporte`
 * en la v1. Los planes mensuales resetean capacidad por período
 * (`support_monthly_periods`); bolsa/a demanda no tienen períodos, así que
 * su historial se arma agrupando horas aprobadas por mes.
 *
 * Servicio de dominio, no caso de uso: lo usan tanto
 * `GetSupportPlanSummaryUseCase` (ficha de UN proyecto) como
 * `GetSupportPlanUseCase` (ficha del CONTRATO completo) — un caso de uso no
 * puede importar a otro (ver `architecture.spec.ts`), así que lo compartido
 * vive aquí.
 */
@Injectable()
export class SupportPlanSummaryBuilder {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    private readonly periods: SupportMonthlyPeriodReconciler,
  ) {}

  async build(plan: SupportPlanRecord, linkedProjectIds: readonly string[], now: Date): Promise<SupportProjectSummary> {
    if (plan.planType === 'monthly') {
      return this.buildMonthlySummary(
        plan,
        plan.contractedHours,
        plan.planValueUf,
        plan.extraHourValueUf,
        plan.currency,
        plan.surplusPolicy === 'accumulate',
        now,
      );
    }
    return this.buildUsageSummary(linkedProjectIds, plan.planType, plan.contractedHours, plan.planValueUf, plan.extraHourValueUf, plan.currency);
  }

  /** Proyectos cuyas horas consume el contrato — ver `resolveSupportPlanHourProjectIds`. */
  async resolveLinkedProjectIds(plan: SupportPlanRecord): Promise<string[]> {
    return resolveSupportPlanHourProjectIds(this.plans, plan);
  }

  /** Proyectos que el contrato cubre, para mostrar — ver `resolveSupportPlanProjectIds`. */
  async resolveCoveredProjectIds(plan: SupportPlanRecord): Promise<string[]> {
    return resolveSupportPlanProjectIds(this.plans, plan);
  }

  private async buildMonthlySummary(
    plan: SupportPlanRecord,
    contractedHours: number,
    planValueUf: number,
    extraHourValueUf: number,
    currency: SupportPlanRecord['currency'],
    isAccumulate: boolean,
    now: Date,
  ): Promise<SupportProjectSummary> {
    const periods = (await this.periods.listPeriods(plan, now)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    /** El saldo reutilizado ya viene calculado en el período (v1: `hh_saldo_reutilizado`) — no hace falta adivinarlo buscando el período cuyo fin calce con este inicio. */
    const priorSurplusOf = (period: SupportMonthlyPeriodRecord) => (isAccumulate ? period.reusedBalanceHours : 0);

    const current = periods.find((period) => period.status === 'active' && period.startDate <= now && now < period.endDate);

    const currentPeriod = current
      ? (() => {
          const priorSurplusHours = priorSurplusOf(current);
          const capacityHours = current.contractedHours + priorSurplusHours;
          return {
            usedHours: current.consumedHoursPeriod,
            capacityHours,
            remainingHours: Math.max(capacityHours - current.consumedHoursPeriod, 0),
            planHours: current.contractedHours,
            priorSurplusHours,
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
      planValueUf,
      extraHourValueUf,
      currency,
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
    projectIds: readonly string[],
    planType: 'bundle' | 'on_demand',
    contractedHours: number,
    planValueUf: number,
    extraHourValueUf: number,
    currency: SupportPlanRecord['currency'],
  ): Promise<SupportProjectSummary> {
    const pages = await Promise.all(
      projectIds.map((projectId) =>
        this.hourEntries.search(
          { projectId, status: 'approved' },
          { page: 1, pageSize: HOUR_ENTRY_PAGE_SIZE },
          { field: 'date', direction: 'asc' },
        ),
      ),
    );
    const items = pages.flatMap((page) => page.items);

    const byMonth = new Map<string, number>();
    for (const entry of items) {
      const key = `${entry.date.getUTCFullYear()}-${entry.date.getUTCMonth()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + entry.hours);
    }

    const usedHours = items.reduce((sum, entry) => sum + entry.hours, 0);

    return {
      planType,
      contractedHours,
      planValueUf,
      extraHourValueUf,
      currency,
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
