import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, UNIT_OF_WORK, type IdGenerator, type UnitOfWork } from '@kora/core';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportMonthlyPeriodRecord,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import {
  SUPPORT_CONSUMPTION_READER,
  sumConsumptionDays,
  type SupportConsumptionReader,
} from '../ports/support-consumption-reader.port';
import { resolveSupportPlanHourProjectIds } from './support-plan-linked-projects';

/**
 * Mantiene al día la cadena de períodos de un plan `monthly` — el reemplazo
 * de `recalc_proyecto_hh_utilizadas` de la v1, que la reconciliaba con cada
 * cambio de horas. La v2 no tiene jobs recurrentes, así que se reconcilia de
 * forma perezosa: TODA lectura de períodos pasa por `listPeriods`.
 *
 * - Si el último período ya venció y el contrato sigue vigente, lo cierra
 *   (`expired`) y abre el siguiente, de un mes, desde su fin — tantas veces
 *   como meses hayan pasado.
 * - TODOS los períodos de la cadena se recalculan en vivo con el consumo del
 *   contrato (`SupportConsumptionReader`), también los ya cerrados: así la
 *   ficha del contrato cuadra siempre con el Excel del historial de tickets,
 *   aunque una hora se apruebe tarde o se vincule un proyecto después. Las
 *   facturas ya emitidas no se tocan (guardan su propio `hours_billed`).
 * - En política `accumulate`, el sobrante de cada período (contratadas +
 *   saldo reutilizado − consumidas, nunca negativo) pasa como saldo
 *   reutilizado del siguiente; en `expire` se pierde. El primer período
 *   conserva el saldo con el que nació (p. ej. migrado de la v1).
 *
 * Períodos traslapados (duplicados de la v1 que empiezan antes de que termine
 * el anterior) quedan fuera de la cadena: no se recalculan ni suman, para no
 * contar dos veces las mismas horas — ver `canonicalPeriodChain`.
 */
@Injectable()
export class SupportMonthlyPeriodReconciler {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_CONSUMPTION_READER) private readonly consumption: SupportConsumptionReader,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async listPeriods(plan: SupportPlanRecord, now: Date): Promise<SupportMonthlyPeriodRecord[]> {
    const periods = await this.plans.listPeriodsForPlan(plan.id);
    if (plan.planType !== 'monthly' || plan.status === 'cancelled') return periods;

    const chain = canonicalPeriodChain(periods);
    if (chain.length === 0) return periods;

    const changed = await this.reconcile(plan, chain, toUtcDate(now));
    return changed ? this.plans.listPeriodsForPlan(plan.id) : periods;
  }

  private async reconcile(plan: SupportPlanRecord, stored: SupportMonthlyPeriodRecord[], today: Date): Promise<boolean> {
    const accumulate = plan.surplusPolicy === 'accumulate';
    const inForce = (from: Date) => plan.endDate === null || from.getTime() < plan.endDate.getTime();

    // Meses que faltan abrir: solo en contratos vigentes, mientras el último ya venció.
    const chain: Array<SupportMonthlyPeriodRecord & { readonly isNew?: boolean }> = [...stored];
    if (plan.status === 'active') {
      for (let last = chain.at(-1)!; last.endDate.getTime() <= today.getTime() && inForce(last.endDate); last = chain.at(-1)!) {
        chain.push({
          id: this.ids.generate(),
          planId: plan.id,
          startDate: last.endDate,
          endDate: addMonthsUtc(last.endDate, 1),
          contractedHours: plan.contractedHours,
          reusedBalanceHours: 0,
          consumedHoursStart: 0,
          consumedHoursPeriod: 0,
          consumedHoursEnd: null,
          surplusHours: 0,
          status: 'active',
          isNew: true,
        });
      }
    }

    const projectIds = await resolveSupportPlanHourProjectIds(this.plans, plan);
    const days = await this.consumption.listDailyHours(projectIds, chain[0]!.startDate, lastDayOf(chain.at(-1)!));

    const computed = chain.map((period) => ({ period, next: period }));
    for (let index = 0; index < computed.length; index += 1) {
      const { period } = computed[index]!;
      const previous = index > 0 ? computed[index - 1]!.next : null;
      const consumed = sumConsumptionDays(days, period.startDate, period.endDate);
      const reusedBalanceHours = previous ? (accumulate ? previous.surplusHours : 0) : period.reusedBalanceHours;
      const consumedHoursStart = previous ? (previous.consumedHoursEnd ?? round2(previous.consumedHoursStart + previous.consumedHoursPeriod)) : period.consumedHoursStart;
      const hasEnded = period.endDate.getTime() <= today.getTime();
      const status = hasEnded && period.status === 'active' ? 'expired' : period.status;
      computed[index]!.next = {
        ...period,
        reusedBalanceHours,
        consumedHoursStart,
        consumedHoursPeriod: consumed,
        consumedHoursEnd: status === 'active' ? null : round2(consumedHoursStart + consumed),
        surplusHours: round2(Math.max(0, period.contractedHours + (accumulate ? reusedBalanceHours : 0) - consumed)),
        status,
      };
    }

    const pending = computed.filter(({ period, next }) => period.isNew || hasUsageChanged(period, next));
    if (pending.length === 0) return false;

    return this.unitOfWork.run(async (tx) => {
      for (const { period, next } of pending) {
        if (period.isNew) {
          const inserted = await this.plans.createNextPeriod(
            {
              id: next.id,
              planId: next.planId,
              startDate: next.startDate,
              endDate: next.endDate,
              contractedHours: next.contractedHours,
              reusedBalanceHours: next.reusedBalanceHours,
              consumedHoursStart: next.consumedHoursStart,
              surplusPolicy: plan.surplusPolicy ?? 'expire',
            },
            tx,
          );
          // Otro request abrió el mismo período en paralelo — ese se encarga de seguir la cadena.
          if (!inserted) return true;
        }
        await this.plans.updatePeriodUsage(
          next.id,
          {
            consumedHoursPeriod: next.consumedHoursPeriod,
            consumedHoursEnd: next.consumedHoursEnd,
            surplusHours: next.surplusHours,
            reusedBalanceHours: next.reusedBalanceHours,
            consumedHoursStart: next.consumedHoursStart,
            status: next.status,
          },
          tx,
        );
      }
      return true;
    });
  }
}

/**
 * La cadena real de períodos de un plan: sin anulados y sin los que empiezan
 * antes de que termine el anterior (duplicados heredados de la v1, siempre
 * con 0 h). Ordenada por inicio.
 */
export function canonicalPeriodChain(periods: readonly SupportMonthlyPeriodRecord[]): SupportMonthlyPeriodRecord[] {
  const chain: SupportMonthlyPeriodRecord[] = [];
  const sorted = periods
    .filter((period) => period.status !== 'cancelled')
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  for (const period of sorted) {
    const last = chain.at(-1);
    if (last && period.startDate.getTime() < last.endDate.getTime()) continue;
    chain.push(period);
  }
  return chain;
}

function hasUsageChanged(before: SupportMonthlyPeriodRecord, after: SupportMonthlyPeriodRecord): boolean {
  return (
    before.consumedHoursPeriod !== after.consumedHoursPeriod ||
    before.consumedHoursEnd !== after.consumedHoursEnd ||
    before.surplusHours !== after.surplusHours ||
    before.reusedBalanceHours !== after.reusedBalanceHours ||
    before.consumedHoursStart !== after.consumedHoursStart ||
    before.status !== after.status
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** El período es [inicio, fin): su último día es el anterior a `endDate`. */
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
