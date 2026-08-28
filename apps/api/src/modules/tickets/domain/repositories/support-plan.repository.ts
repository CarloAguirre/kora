import type { TransactionContext } from '@kora/core';

export interface SupportPlanRecord {
  readonly id: string;
  readonly projectId: string;
  readonly planType: 'monthly' | 'bundle' | 'on_demand';
  readonly surplusPolicy: 'accumulate' | 'expire' | null;
  readonly status: 'active' | 'ended' | 'cancelled';
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly contractedHours: number;
}

export interface SupportMonthlyPeriodRecord {
  readonly id: string;
  readonly planId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly contractedHours: number;
  readonly consumedHoursPeriod: number;
  readonly surplusHours: number;
  readonly status: 'active' | 'expired' | 'closed' | 'cancelled';
}

/**
 * Lectura de planes de soporte — solo lo que necesita el gate de creación de
 * tickets (`soporte_has_active_usable_plan`). Ver docs/DECISION-M5-TICKETS.md:
 * no incluye el libro de movimientos de saldo ni la escritura de planes.
 */
export interface SupportPlanRepository {
  findActiveForProject(projectId: string, context?: TransactionContext): Promise<SupportPlanRecord | null>;
  listPeriodsForPlan(planId: string, context?: TransactionContext): Promise<SupportMonthlyPeriodRecord[]>;
}

export const SUPPORT_PLAN_REPOSITORY = Symbol('SupportPlanRepository');
