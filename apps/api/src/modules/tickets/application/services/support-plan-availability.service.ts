import { Inject, Injectable } from '@nestjs/common';
import type { SupportPlanAvailability } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';

/**
 * Reimplementación de `soporte_has_active_usable_plan` como servicio de
 * aplicación — ver docs/DECISION-M5-TICKETS.md. Mismo árbol de decisión que
 * la función SQL, sin la parte de "quién puede verlo" (eso ya lo resuelve el
 * sistema de permisos de la v2).
 */
@Injectable()
export class SupportPlanAvailabilityService {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    private readonly periods: SupportMonthlyPeriodReconciler,
  ) {}

  async check(projectId: string, now: Date): Promise<SupportPlanAvailability> {
    const plan = await this.plans.findActiveForProjectOrLinked(projectId);
    if (!plan || plan.status !== 'active') return { hasActiveUsablePlan: false, plan: null };

    const today = startOfDay(now);
    if (today < startOfDay(plan.startDate)) return { hasActiveUsablePlan: false, plan: null };

    const withinContractWindow = plan.planType === 'monthly' || (plan.endDate !== null && today <= startOfDay(plan.endDate));
    if (!withinContractWindow) return { hasActiveUsablePlan: false, plan: null };

    if (plan.planType !== 'monthly') {
      return {
        hasActiveUsablePlan: true,
        plan: { id: plan.id, planType: plan.planType, contractedHours: plan.contractedHours, currentPeriod: null },
      };
    }

    const periods = await this.periods.listPeriods(plan, now);
    const activePeriod = periods.find(
      (period) => period.status === 'active' && today >= startOfDay(period.startDate) && today < startOfDay(period.endDate),
    );
    const hasPastPeriod = periods.some((period) => startOfDay(period.endDate) <= today);
    const usableViaSurplus = plan.surplusPolicy === 'accumulate' && hasPastPeriod;

    if (!activePeriod && !usableViaSurplus) return { hasActiveUsablePlan: false, plan: null };

    return {
      hasActiveUsablePlan: true,
      plan: {
        id: plan.id,
        planType: plan.planType,
        contractedHours: plan.contractedHours,
        currentPeriod: activePeriod
          ? {
              startDate: activePeriod.startDate.toISOString().slice(0, 10),
              endDate: activePeriod.endDate.toISOString().slice(0, 10),
              contractedHours: activePeriod.contractedHours,
              consumedHoursPeriod: activePeriod.consumedHoursPeriod,
              surplusHours: activePeriod.surplusHours,
            }
          : null,
      },
    };
  }
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
