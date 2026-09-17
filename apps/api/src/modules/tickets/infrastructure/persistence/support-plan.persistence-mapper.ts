import type { SupportPlanCurrency, SupportPlanScope, SupportPlanStatus, SupportPlanType, SupportSurplusPolicy } from '@kora/contracts';
import { SupportPlan } from '../../domain/entities/support-plan.entity';
import type { SupportPlanRecord } from '../../domain/repositories/support-plan.repository';

/** Fila cruda de Drizzle — los `numeric` de Postgres llegan como `string` vía `postgres-js`. */
export interface SupportPlanRow {
  id: string;
  legacyId: number | null;
  clientId: string;
  projectId: string | null;
  planType: string;
  scope: string;
  surplusPolicy: string | null;
  status: string;
  startDate: Date;
  endDate: Date | null;
  contractedHours: string;
  planValueUf: string;
  extraHourValueUf: string;
  currency: string;
  name: string | null;
  leaderUserId: string | null;
  primaryContactId: string | null;
  quotationLink: string | null;
  contractLink: string | null;
  additionalLinks: string | null;
  dueDayOfMonth: number | null;
  targetHoursCritical: string | null;
  targetHoursHigh: string | null;
  targetHoursMedium: string | null;
  targetHoursLow: string | null;
  closedAt: Date | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toRecord(row: SupportPlanRow): SupportPlanRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    projectId: row.projectId,
    planType: row.planType as SupportPlanType,
    scope: row.scope as SupportPlanScope,
    surplusPolicy: row.surplusPolicy as SupportSurplusPolicy | null,
    status: row.status as SupportPlanStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    contractedHours: Number(row.contractedHours),
    planValueUf: Number(row.planValueUf),
    extraHourValueUf: Number(row.extraHourValueUf),
    currency: row.currency as SupportPlanCurrency,
    name: row.name,
    leaderUserId: row.leaderUserId,
    primaryContactId: row.primaryContactId,
    quotationLink: row.quotationLink,
    contractLink: row.contractLink,
    additionalLinks: row.additionalLinks,
    dueDayOfMonth: row.dueDayOfMonth,
    targetHoursCritical: row.targetHoursCritical !== null ? Number(row.targetHoursCritical) : null,
    targetHoursHigh: row.targetHoursHigh !== null ? Number(row.targetHoursHigh) : null,
    targetHoursMedium: row.targetHoursMedium !== null ? Number(row.targetHoursMedium) : null,
    targetHoursLow: row.targetHoursLow !== null ? Number(row.targetHoursLow) : null,
    closedAt: row.closedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomain(row: SupportPlanRow): SupportPlan {
  return SupportPlan.restore({
    id: row.id,
    legacyId: row.legacyId,
    clientId: row.clientId,
    projectId: row.projectId,
    planType: row.planType as SupportPlanType,
    scope: row.scope as SupportPlanScope,
    surplusPolicy: row.surplusPolicy as SupportSurplusPolicy | null,
    status: row.status as SupportPlanStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    contractedHours: Number(row.contractedHours),
    planValueUf: Number(row.planValueUf),
    extraHourValueUf: Number(row.extraHourValueUf),
    currency: row.currency as SupportPlanCurrency,
    name: row.name,
    leaderUserId: row.leaderUserId,
    primaryContactId: row.primaryContactId,
    quotationLink: row.quotationLink,
    contractLink: row.contractLink,
    additionalLinks: row.additionalLinks,
    dueDayOfMonth: row.dueDayOfMonth,
    targetHoursCritical: row.targetHoursCritical !== null ? Number(row.targetHoursCritical) : null,
    targetHoursHigh: row.targetHoursHigh !== null ? Number(row.targetHoursHigh) : null,
    targetHoursMedium: row.targetHoursMedium !== null ? Number(row.targetHoursMedium) : null,
    targetHoursLow: row.targetHoursLow !== null ? Number(row.targetHoursLow) : null,
    closedAt: row.closedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPersistence(plan: SupportPlan) {
  const snapshot = plan.toSnapshot();
  return {
    legacyId: snapshot.legacyId,
    clientId: snapshot.clientId,
    projectId: snapshot.projectId,
    planType: snapshot.planType,
    scope: snapshot.scope,
    surplusPolicy: snapshot.surplusPolicy,
    status: snapshot.status,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    contractedHours: String(snapshot.contractedHours),
    planValueUf: String(snapshot.planValueUf),
    extraHourValueUf: String(snapshot.extraHourValueUf),
    currency: snapshot.currency,
    name: snapshot.name,
    leaderUserId: snapshot.leaderUserId,
    primaryContactId: snapshot.primaryContactId,
    quotationLink: snapshot.quotationLink,
    contractLink: snapshot.contractLink,
    additionalLinks: snapshot.additionalLinks,
    dueDayOfMonth: snapshot.dueDayOfMonth,
    targetHoursCritical: snapshot.targetHoursCritical !== null ? String(snapshot.targetHoursCritical) : null,
    targetHoursHigh: snapshot.targetHoursHigh !== null ? String(snapshot.targetHoursHigh) : null,
    targetHoursMedium: snapshot.targetHoursMedium !== null ? String(snapshot.targetHoursMedium) : null,
    targetHoursLow: snapshot.targetHoursLow !== null ? String(snapshot.targetHoursLow) : null,
    closedAt: snapshot.closedAt,
    closeReason: snapshot.closeReason,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
