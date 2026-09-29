import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, supportMonthlyPeriods, supportPlanProjects, supportPlans, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type { SupportPlan } from '../../domain/entities/support-plan.entity';
import type {
  CreateInitialSupportMonthlyPeriodInput,
  CreateNextSupportMonthlyPeriodInput,
  SupportMonthlyPeriodRecord,
  SupportMonthlyPeriodUsageUpdate,
  SupportPlanRecord,
  SupportPlanRepository,
} from '../../domain/repositories/support-plan.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence, toRecord, type SupportPlanRow } from './support-plan.persistence-mapper';

@Injectable()
export class DrizzleSupportPlanRepository implements SupportPlanRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findActiveForProjectOrLinked(projectId: string, context?: TransactionContext): Promise<SupportPlanRecord | null> {
    const db = resolveDb(this.database, context);

    const direct = await db
      .select()
      .from(supportPlans)
      .where(and(eq(supportPlans.projectId, projectId), eq(supportPlans.status, 'active')))
      .limit(1);
    if (direct[0]) return toRecord(direct[0] as SupportPlanRow);

    const linked = await db
      .select({ plan: supportPlans })
      .from(supportPlanProjects)
      .innerJoin(supportPlans, eq(supportPlanProjects.planId, supportPlans.id))
      .where(and(eq(supportPlanProjects.developmentProjectId, projectId), eq(supportPlans.status, 'active')))
      .limit(1);
    const row = linked[0]?.plan;
    return row ? toRecord(row as SupportPlanRow) : null;
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

  async createInitialPeriod(input: CreateInitialSupportMonthlyPeriodInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.insert(supportMonthlyPeriods).values({
      id: input.id,
      planId: input.planId,
      projectId: null,
      startDate: input.startDate,
      endDate: input.endDate,
      surplusPolicy: input.surplusPolicy,
      contractedHours: String(input.contractedHours),
      reusedBalanceHours: '0',
      consumedHoursStart: '0',
      consumedHoursPeriod: '0',
      surplusHours: '0',
      status: 'active',
    });
  }

  async createNextPeriod(input: CreateNextSupportMonthlyPeriodInput, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const inserted = await db
      .insert(supportMonthlyPeriods)
      .values({
        id: input.id,
        planId: input.planId,
        projectId: null,
        startDate: input.startDate,
        endDate: input.endDate,
        surplusPolicy: input.surplusPolicy,
        contractedHours: String(input.contractedHours),
        reusedBalanceHours: String(input.reusedBalanceHours),
        consumedHoursStart: String(input.consumedHoursStart),
        consumedHoursPeriod: '0',
        surplusHours: '0',
        status: 'active',
      })
      .onConflictDoNothing()
      .returning({ id: supportMonthlyPeriods.id });
    return inserted.length > 0;
  }

  async updatePeriodUsage(periodId: string, usage: SupportMonthlyPeriodUsageUpdate, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db
      .update(supportMonthlyPeriods)
      .set({
        consumedHoursPeriod: String(usage.consumedHoursPeriod),
        consumedHoursEnd: usage.consumedHoursEnd === null ? null : String(usage.consumedHoursEnd),
        surplusHours: String(usage.surplusHours),
        status: usage.status,
        updatedAt: new Date(),
      })
      .where(eq(supportMonthlyPeriods.id, periodId));
  }

  async findById(id: string, context?: TransactionContext): Promise<SupportPlan | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportPlans).where(eq(supportPlans.id, id)).limit(1);
    const row = rows[0];
    return row ? toDomain(row as SupportPlanRow) : null;
  }

  async findBySlug(slug: string, context?: TransactionContext): Promise<SupportPlan | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportPlans).where(eq(supportPlans.slug, slug)).limit(1);
    const row = rows[0];
    return row ? toDomain(row as SupportPlanRow) : null;
  }

  async listForClient(clientId: string, context?: TransactionContext): Promise<SupportPlanRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportPlans).where(eq(supportPlans.clientId, clientId));
    return rows.map((row) => toRecord(row as SupportPlanRow));
  }

  async listAllActive(context?: TransactionContext): Promise<SupportPlanRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportPlans).where(eq(supportPlans.status, 'active'));
    return rows.map((row) => toRecord(row as SupportPlanRow));
  }

  async save(plan: SupportPlan, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(plan);

    await db
      .insert(supportPlans)
      .values({ id: plan.id, ...values })
      .onConflictDoUpdate({ target: supportPlans.id, set: values });
  }

  async linkProjects(planId: string, developmentProjectIds: readonly string[], context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(supportPlanProjects).where(eq(supportPlanProjects.planId, planId));
    if (developmentProjectIds.length === 0) return;

    await db
      .insert(supportPlanProjects)
      .values(developmentProjectIds.map((developmentProjectId) => ({ planId, developmentProjectId })));
  }

  async listLinkedProjectIds(planId: string, context?: TransactionContext): Promise<string[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ developmentProjectId: supportPlanProjects.developmentProjectId })
      .from(supportPlanProjects)
      .where(eq(supportPlanProjects.planId, planId));
    return rows.map((row) => row.developmentProjectId);
  }

  async findProjectIdsAlreadyLinked(
    developmentProjectIds: readonly string[],
    excludingPlanId?: string,
    context?: TransactionContext,
  ): Promise<string[]> {
    if (developmentProjectIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const conditions = [inArray(supportPlanProjects.developmentProjectId, [...developmentProjectIds]), eq(supportPlans.status, 'active')];
    if (excludingPlanId) conditions.push(ne(supportPlans.id, excludingPlanId));

    const rows = await db
      .select({ developmentProjectId: supportPlanProjects.developmentProjectId })
      .from(supportPlanProjects)
      .innerJoin(supportPlans, eq(supportPlanProjects.planId, supportPlans.id))
      .where(and(...conditions));
    return rows.map((row) => row.developmentProjectId);
  }
}
