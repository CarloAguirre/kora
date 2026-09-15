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
  onHoldReason: string | null;
  stopsClock: boolean;
  scopeNotes: string | null;
  deliveryDocumentation: string | null;
  demoLink: string | null;
  testEnvironmentLink: string | null;
  figmaLink: string | null;
  documentationLink: string | null;
  impactBeforeHours: string | null;
  impactBeforePeople: string | null;
  impactBeforeDuration: string | null;
  impactBeforeModality: string | null;
  impactAfterHours: string | null;
  impactAfterPeople: string | null;
  impactAfterDuration: string | null;
  impactAfterModality: string | null;
  qaTestingStartDate: Date | null;
  qaTestingEndDate: Date | null;
  qaEvaluatedModule: string | null;
  qaPlannedTests: number | null;
  qaExecutedTests: number | null;
  qaFailedTests: number | null;
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
    onHoldReason: row.onHoldReason,
    stopsClock: row.stopsClock,
    scopeNotes: row.scopeNotes,
    deliveryDocumentation: row.deliveryDocumentation,
    demoLink: row.demoLink,
    testEnvironmentLink: row.testEnvironmentLink,
    figmaLink: row.figmaLink,
    documentationLink: row.documentationLink,
    impactBeforeHours: row.impactBeforeHours === null ? null : Number(row.impactBeforeHours),
    impactBeforePeople: row.impactBeforePeople,
    impactBeforeDuration: row.impactBeforeDuration,
    impactBeforeModality: row.impactBeforeModality,
    impactAfterHours: row.impactAfterHours === null ? null : Number(row.impactAfterHours),
    impactAfterPeople: row.impactAfterPeople,
    impactAfterDuration: row.impactAfterDuration,
    impactAfterModality: row.impactAfterModality,
    qaTestingStartDate: row.qaTestingStartDate,
    qaTestingEndDate: row.qaTestingEndDate,
    qaEvaluatedModule: row.qaEvaluatedModule,
    qaPlannedTests: row.qaPlannedTests,
    qaExecutedTests: row.qaExecutedTests,
    qaFailedTests: row.qaFailedTests,
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
    onHoldReason: snapshot.onHoldReason,
    stopsClock: snapshot.stopsClock,
    scopeNotes: snapshot.scopeNotes,
    deliveryDocumentation: snapshot.deliveryDocumentation,
    demoLink: snapshot.demoLink,
    testEnvironmentLink: snapshot.testEnvironmentLink,
    figmaLink: snapshot.figmaLink,
    documentationLink: snapshot.documentationLink,
    impactBeforeHours: snapshot.impactBeforeHours === null ? null : String(snapshot.impactBeforeHours),
    impactBeforePeople: snapshot.impactBeforePeople,
    impactBeforeDuration: snapshot.impactBeforeDuration,
    impactBeforeModality: snapshot.impactBeforeModality,
    impactAfterHours: snapshot.impactAfterHours === null ? null : String(snapshot.impactAfterHours),
    impactAfterPeople: snapshot.impactAfterPeople,
    impactAfterDuration: snapshot.impactAfterDuration,
    impactAfterModality: snapshot.impactAfterModality,
    qaTestingStartDate: snapshot.qaTestingStartDate,
    qaTestingEndDate: snapshot.qaTestingEndDate,
    qaEvaluatedModule: snapshot.qaEvaluatedModule,
    qaPlannedTests: snapshot.qaPlannedTests,
    qaExecutedTests: snapshot.qaExecutedTests,
    qaFailedTests: snapshot.qaFailedTests,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
