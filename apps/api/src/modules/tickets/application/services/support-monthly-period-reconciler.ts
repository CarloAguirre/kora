import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, UNIT_OF_WORK, type IdGenerator, type UnitOfWork } from '@kora/core';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportMonthlyPeriodRecord,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { resolveSupportPlanProjectIds } from './support-plan-linked-projects';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mantiene al día la cadena de períodos de un plan `monthly` — el reemplazo
 * de `recalc_proyecto_hh_utilizadas` de la v1, que la reconciliaba con cada
 * cambio de horas. La v2 no tiene jobs recurrentes, así que se reconcilia de
 * forma perezosa: TODA lectura de períodos pasa por `listPeriods`.
 *
 * - Si el último período ya venció y el contrato sigue vigente, lo cierra
 *   (`expired`, con su consumo final) y abre el siguiente, de un mes, desde
 *   su fin — tantas veces como meses hayan pasado.
 * - En política `accumulate`, el sobrante del período cerrado
 *   (contratadas + saldo reutilizado − consumidas, nunca negativo) pasa como
 *   saldo reutilizado del siguiente; en `expire` se pierde.
 * - El consumo del período vigente se recalcula con las horas aprobadas de
 *   los proyectos del contrato (el mismo criterio que bolsa/a demanda).
 *
 * Solo toca el último período de la cadena: los ya cerrados son historial y
 * se respetan tal como quedaron (incluidos los migrados desde la v1).
 */
@Injectable()
export class SupportMonthlyPeriodReconciler {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async listPeriods(plan: SupportPlanRecord, now: Date): Promise<SupportMonthlyPeriodRecord[]> {
    const periods = await this.plans.listPeriodsForPlan(plan.id);
    if (plan.planType !== 'monthly' || plan.status !== 'active') return periods;

    const chain = periods.filter((period) => period.status !== 'cancelled').sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const latest = chain.at(-1);
    if (!latest || latest.status !== 'active') return periods;

    const changed = await this.reconcile(plan, latest, toUtcDate(now));
    return changed ? this.plans.listPeriodsForPlan(plan.id) : periods;
  }

  private async reconcile(plan: SupportPlanRecord, latest: SupportMonthlyPeriodRecord, today: Date): Promise<boolean> {
    const projectIds = await resolveSupportPlanProjectIds(this.plans, plan);
    const accumulate = plan.surplusPolicy === 'accumulate';
    const inForce = (from: Date) => plan.endDate === null || from.getTime() < plan.endDate.getTime();

    return this.unitOfWork.run(async (tx) => {
      let changed = false;
      let current = latest;

      for (;;) {
        const consumed = await this.hourEntries.sumApprovedHoursForProjects(projectIds, current.startDate, lastDayOf(current), tx);
        const surplus = round2(Math.max(0, current.contractedHours + (accumulate ? current.reusedBalanceHours : 0) - consumed));
        const hasEnded = current.endDate.getTime() <= today.getTime();

        if (!hasEnded) {
          if (consumed !== current.consumedHoursPeriod || surplus !== current.surplusHours) {
            await this.plans.updatePeriodUsage(current.id, { consumedHoursPeriod: consumed, consumedHoursEnd: null, surplusHours: surplus, status: 'active' }, tx);
            changed = true;
          }
          return changed;
        }

        const consumedHoursEnd = round2(current.consumedHoursStart + consumed);
        await this.plans.updatePeriodUsage(current.id, { consumedHoursPeriod: consumed, consumedHoursEnd, surplusHours: surplus, status: 'expired' }, tx);
        changed = true;

        // Contrato terminado: el último período se cierra, pero no se abre uno nuevo.
        if (!inForce(current.endDate)) return changed;

        const next: SupportMonthlyPeriodRecord = {
          id: this.ids.generate(),
          planId: plan.id,
          startDate: current.endDate,
          endDate: addMonthsUtc(current.endDate, 1),
          contractedHours: plan.contractedHours,
          reusedBalanceHours: accumulate ? surplus : 0,
          consumedHoursStart: consumedHoursEnd,
          consumedHoursPeriod: 0,
          consumedHoursEnd: null,
          surplusHours: 0,
          status: 'active',
        };
        const inserted = await this.plans.createNextPeriod({ ...next, surplusPolicy: plan.surplusPolicy ?? 'expire' }, tx);
        // Otro request abrió el mismo período en paralelo — ese se encarga de seguir la cadena.
        if (!inserted) return changed;
        current = next;
      }
    });
  }
}

/** `sumApprovedHoursForProjects` incluye ambos extremos; el período es [inicio, fin). */
function lastDayOf(period: SupportMonthlyPeriodRecord): Date {
  return new Date(period.endDate.getTime() - DAY_MS);
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
