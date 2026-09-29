import { Inject, Injectable } from '@nestjs/common';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';

export interface SupportBillingCalculation {
  readonly amountUf: number;
  readonly hoursBilled: number | null;
  /** 'YYYY-MM'. */
  readonly periodKey: string;
  readonly monthlyPeriodId: string | null;
}

/**
 * Calcula cuánto corresponde facturar HOY por un plan de soporte. Es lógica
 * financiera — la única regla de todo este trabajo que el propio
 * `docs/PLAN-MODULOS.md` marca como la que "merece los tests más estrictos
 * del proyecto" — así que vive aislada de `MarkSupportInvoiceIssuedUseCase`
 * (que solo orquesta: calcula, congela el resultado en una fila de
 * `support_invoices`, y en `on_demand` enlaza los tickets facturados).
 *
 * Nunca mira el pasado más allá de lo necesario para no volver a cobrar lo ya
 * facturado: en `on_demand` factura el mes calendario en curso; en `bundle`,
 * el excedente NUEVO desde la última factura; en `monthly`, reutiliza el
 * mismo árbol de decisión que `GetSupportPlanSummaryUseCase` para la cuota y
 * el excedente del período activo.
 */
@Injectable()
export class SupportBillingCalculator {
  constructor(
    private readonly periods: SupportMonthlyPeriodReconciler,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
  ) {}

  /** `null` cuando no hay nada que facturar hoy (monto 0) — nunca se factura una fila con monto 0. */
  async calculate(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
  ): Promise<SupportBillingCalculation | null> {
    if (plan.planType === 'on_demand') return this.calculateOnDemand(plan, linkedProjectIds, today);
    if (plan.planType === 'bundle') return this.calculateBundle(plan, linkedProjectIds, today);
    return this.calculateMonthly(plan, today);
  }

  private async calculateOnDemand(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
  ): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const monthStart = startOfMonth(day);
    const from = monthStart.getTime() > plan.startDate.getTime() ? monthStart : plan.startDate;
    const hours = await this.hourEntries.sumApprovedHoursForProjects(linkedProjectIds, from, day);
    if (hours <= 0) return null;

    return { amountUf: round2(hours * plan.planValueUf), hoursBilled: hours, periodKey: periodKeyOf(day), monthlyPeriodId: null };
  }

  private async calculateBundle(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
  ): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const totalUsed = await this.hourEntries.sumApprovedHoursForProjects(linkedProjectIds, plan.startDate, day);
    const totalOverage = Math.max(0, totalUsed - plan.contractedHours);

    const alreadyBilled = await this.invoices.sumHoursBilledForPlan(plan.id);
    const newOverage = Math.max(0, totalOverage - alreadyBilled);
    if (newOverage <= 0) return null;

    return {
      amountUf: round2(newOverage * plan.extraHourValueUf),
      hoursBilled: newOverage,
      periodKey: periodKeyOf(day),
      monthlyPeriodId: null,
    };
  }

  private async calculateMonthly(plan: SupportPlanRecord, today: Date): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const periods = await this.periods.listPeriods(plan, today);
    const current = periods.find(
      (period) => period.status === 'active' && period.startDate.getTime() <= day.getTime() && day.getTime() < period.endDate.getTime(),
    );
    if (!current) return null;

    /** Igual criterio que `GetSupportPlanSummaryUseCase.buildMonthlySummary`: el saldo reutilizado solo cuenta si la política es acumulable. */
    const priorSurplus = plan.surplusPolicy === 'accumulate' ? current.reusedBalanceHours : 0;
    const capacity = current.contractedHours + priorSurplus;
    const overage = Math.max(0, current.consumedHoursPeriod - capacity);

    const isLastPeriod = plan.endDate !== null && current.endDate.getTime() >= plan.endDate.getTime();
    const billsOverageAsExtra = isLastPeriod && plan.surplusPolicy !== 'accumulate' && overage > 0;

    return {
      amountUf: round2(plan.planValueUf + (billsOverageAsExtra ? overage * plan.extraHourValueUf : 0)),
      hoursBilled: billsOverageAsExtra ? overage : null,
      periodKey: periodKeyOf(current.startDate),
      monthlyPeriodId: current.id,
    };
  }
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
