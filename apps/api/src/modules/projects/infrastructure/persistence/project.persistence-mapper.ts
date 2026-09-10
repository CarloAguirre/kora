import type { ProjectPhase, ProjectPriority, ProjectSalesStage, ProjectStatus, ProjectType } from '@kora/contracts';
import { Project } from '../../domain/entities/project.entity';

export interface ProjectRow {
  id: string;
  legacyId: number | null;
  name: string;
  clientId: string | null;
  primaryContactId: string | null;
  type: string;
  salesStage: string | null;
  status: string;
  phase: string | null;
  priority: string | null;
  leaderUserId: string | null;
  developerUserId: string | null;
  commercialManagerUserId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  estimatedDeliveryDate: Date | null;
  soldHours: string;
  usedHours: string;
  expectedProgress: number | null;
  actualProgress: number | null;
  supportPlanDescription: string | null;
  supportHours: string;
  overtimeRateUf: string;
  allowsOvertime: boolean;
  quotationLink: string | null;
  contractLink: string | null;
  additionalLinks: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDomain(row: ProjectRow): Project {
  return Project.restore({
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    primaryContactId: row.primaryContactId,
    type: row.type as ProjectType,
    salesStage: row.salesStage as ProjectSalesStage | null,
    status: row.status as ProjectStatus,
    phase: row.phase as ProjectPhase | null,
    priority: row.priority as ProjectPriority | null,
    leaderUserId: row.leaderUserId,
    developerUserId: row.developerUserId,
    commercialManagerUserId: row.commercialManagerUserId,
    startDate: row.startDate,
    endDate: row.endDate,
    estimatedDeliveryDate: row.estimatedDeliveryDate,
    soldHours: Number(row.soldHours),
    usedHours: Number(row.usedHours),
    expectedProgress: row.expectedProgress,
    actualProgress: row.actualProgress,
    supportPlanDescription: row.supportPlanDescription,
    supportHours: Number(row.supportHours),
    overtimeRateUf: Number(row.overtimeRateUf),
    allowsOvertime: row.allowsOvertime,
    quotationLink: row.quotationLink,
    contractLink: row.contractLink,
    additionalLinks: row.additionalLinks,
    legacyId: row.legacyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toPersistence(project: Project) {
  const snapshot = project.toSnapshot();
  return {
    name: snapshot.name,
    clientId: snapshot.clientId,
    primaryContactId: snapshot.primaryContactId,
    type: snapshot.type,
    salesStage: snapshot.salesStage,
    status: snapshot.status,
    phase: snapshot.phase,
    priority: snapshot.priority,
    leaderUserId: snapshot.leaderUserId,
    developerUserId: snapshot.developerUserId,
    commercialManagerUserId: snapshot.commercialManagerUserId,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    estimatedDeliveryDate: snapshot.estimatedDeliveryDate,
    soldHours: String(snapshot.soldHours),
    usedHours: String(snapshot.usedHours),
    expectedProgress: snapshot.expectedProgress,
    actualProgress: snapshot.actualProgress,
    supportPlanDescription: snapshot.supportPlanDescription,
    supportHours: String(snapshot.supportHours),
    overtimeRateUf: String(snapshot.overtimeRateUf),
    allowsOvertime: snapshot.allowsOvertime,
    quotationLink: snapshot.quotationLink,
    contractLink: snapshot.contractLink,
    additionalLinks: snapshot.additionalLinks,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
