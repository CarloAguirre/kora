import { Inject, Injectable } from '@nestjs/common';
import { and, eq, supportMonthlyPeriods, supportPlans, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  SupportMonthlyPeriodRecord,
  SupportPlanRecord,
  SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleSupportPlanRepository implements SupportPlanRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findActiveForProject(projectId: string, context?: TransactionContext): Promise<SupportPlanRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select()
      .from(supportPlans)
      .where(and(eq(supportPlans.projectId, projectId), eq(supportPlans.status, 'active')))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      projectId: row.projectId,
      planType: row.planType,
      surplusPolicy: row.surplusPolicy,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      contractedHours: Number(row.contractedHours),
      planValueUf: Number(row.planValueUf),
      extraHourValueUf: Number(row.extraHourValueUf),
    };
  }

  async listPeriodsForPlan(planId: string, context?: TransactionContext): Promise<SupportMonthlyPeriodRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportMonthlyPeriods).where(eq(supportMonthlyPeriods.planId, planId));

    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      startDate: row.startDate,
      endDate: row.endDate,
      contractedHours: Number(row.contractedHours),
      consumedHoursPeriod: Number(row.consumedHoursPeriod),
      surplusHours: Number(row.surplusHours),
      status: row.status,
      reusedBalanceHours: Number(row.reusedBalanceHours),
      consumedHoursStart: Number(row.consumedHoursStart),
      consumedHoursEnd: row.consumedHoursEnd !== null ? Number(row.consumedHoursEnd) : null,
    }));
  }
}
