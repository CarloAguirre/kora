import { Inject, Injectable } from '@nestjs/common';
import type { SupportProjectSummary } from '@kora/contracts';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportMonthlyPeriodRecord,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { SUPPORT_CONSUMPTION_READER, type SupportConsumptionReader } from '../ports/support-consumption-reader.port';
import { SupportMonthlyPeriodReconciler, canonicalPeriodChain } from './support-monthly-period-reconciler';
import { resolveSupportPlanHourProjectIds, resolveSupportPlanProjectIds } from './support-plan-linked-projects';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
    @Inject(SUPPORT_CONSUMPTION_READER) private readonly consumption: SupportConsumptionReader,
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
    return this.buildUsageSummary(linkedProjectIds, plan, plan.planType);
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
      // Solo la cadena real: los duplicados traslapados de la v1 no suman (ver `canonicalPeriodChain`).
      usedHours: round2(canonicalPeriodChain(periods).reduce((sum, period) => sum + period.consumedHoursPeriod, 0)),
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

  /**
   * Cuentan las horas dentro de la vigencia del contrato (`startDate`..`endDate`,
   * inclusive) más las de tickets anteriores al inicio, que se suman al primer
   * mes. Mismo consumo que los períodos mensuales — ver `SupportConsumptionReader`.
   */
  private async buildUsageSummary(
    projectIds: readonly string[],
    plan: SupportPlanRecord,
    planType: 'bundle' | 'on_demand',
  ): Promise<SupportProjectSummary> {
    const { contractedHours, planValueUf, extraHourValueUf, currency } = plan;
    const [days, beforeStart] = await Promise.all([
      this.consumption.listDailyHours(projectIds, plan.startDate, plan.endDate),
      this.consumption.sumTicketHoursBefore(projectIds, plan.startDate),
    ]);

    // Las horas de tickets anteriores al inicio se suman al primer mes del contrato (como en los mensuales).
    const byMonth = new Map<string, number>();
    if (beforeStart > 0) byMonth.set(plan.startDate.toISOString().slice(0, 7), beforeStart);
    for (const day of days) {
      const key = day.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + day.hours);
    }

    const usedHours = round2(days.reduce((sum, day) => sum + day.hours, 0) + beforeStart);

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
          label: MONTH_LABELS[Number(key.split('-')[1]) - 1]!,
          contractedHours: null,
          priorSurplusHours: null,
          usedHours: round2(hours),
        })),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
