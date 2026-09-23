import type {
  ProjectDetail,
  ProjectSummary,
  ProjectTeam as ProjectTeamDto,
  ProjectTeamMember as ProjectTeamMemberDto,
  ProjectObservation as ProjectObservationDto,
  ProjectModule as ProjectModuleDto,
  ProjectPaymentMilestone as ProjectPaymentMilestoneDto,
} from '@kora/contracts';
import type { Project } from '../../domain/entities/project.entity';
import type { ProjectListItem } from '../../domain/repositories/project.repository';
import type { ProjectTeamMemberRecord } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRecord } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_OBSERVATION_DELETE_WINDOW_MS,
  type ProjectObservationRecord,
} from '../../domain/repositories/project-observation.repository';
import type { ProjectModuleRecord } from '../../domain/repositories/project-module.repository';
import type { ProjectPaymentMilestoneRecord } from '../../domain/repositories/project-payment-milestone.repository';
import type { ProjectUserReference } from '../ports/project-user-reader.port';
import type { ProjectClientReference } from '../ports/project-client-reader.port';
import type { ProjectContactReference } from '../ports/project-contact-reader.port';

export function toProjectSummary(item: ProjectListItem): ProjectSummary {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    client: item.clientId ? { id: item.clientId, companyName: item.clientName ?? '' } : null,
    type: item.type,
    salesStage: item.salesStage as ProjectSummary['salesStage'],
    status: item.status,
    phase: item.phase as ProjectSummary['phase'],
    priority: item.priority as ProjectSummary['priority'],
    leader: item.leaderUserId ? { id: item.leaderUserId, fullName: item.leaderName ?? '' } : null,
    soldHours: item.soldHours,
    usedHours: item.usedHours,
    assignedMemberCount: item.assignedMemberCount,
    plannedHours: item.plannedHours,
    startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
    actualProgress: item.actualProgress,
    supportPlanDescription: item.supportPlanDescription,
    supportHours: item.supportHours,
    allowsOvertime: item.allowsOvertime,
    createdAt: item.createdAt.toISOString(),
  };
}

export interface ProjectDetailSource {
  readonly project: Project;
  readonly client: ProjectClientReference | null;
  readonly primaryContact: ProjectContactReference | null;
  readonly leader: ProjectUserReference | null;
  readonly developer: ProjectUserReference | null;
  readonly commercialManager: ProjectUserReference | null;
  readonly members: readonly ProjectTeamMemberRecord[];
  readonly teams: readonly ProjectTeamRecord[];
  readonly observations: readonly ProjectObservationRecord[];
  readonly modules: readonly ProjectModuleRecord[];
  readonly paymentMilestones: readonly ProjectPaymentMilestoneRecord[];
  readonly usedHoursUpdatedAt: Date | null;
  readonly actorUserId: string;
  /** Líder de este proyecto, PMO o admin: puede editar cualquier entrada de bitácora y resolver pendientes. */
  readonly canManagePendings: boolean;
  readonly canAuthorizeOvertime: boolean;
  readonly now: Date;
}

export function toProjectDetail(source: ProjectDetailSource): ProjectDetail {
  const snapshot = source.project.toSnapshot();

  const members: ProjectTeamMemberDto[] = source.members.map((member) => ({
    id: member.id,
    teamId: member.teamId,
    teamName: member.teamName,
    teamMemberId: member.teamMemberId,
    userId: member.userId,
    fullName: member.fullName,
    activity: member.activity,
    assignedHours: member.assignedHours,
    consumedHours: member.consumedHours,
  }));

  const teams: ProjectTeamDto[] = source.teams.map((team) => ({
    id: team.id,
    teamId: team.teamId,
    teamName: team.teamName,
    leader: team.leaderUserId ? { id: team.leaderUserId, fullName: team.leaderName ?? '' } : null,
    assignedHours: team.assignedHours,
    memberCount: team.memberCount,
  }));

  const observations: ProjectObservationDto[] = source.observations.map((observation) => ({
    id: observation.id,
    type: observation.type,
    title: observation.title,
    message: observation.message,
    status: observation.status,
    moduleId: observation.moduleId,
    moduleName: observation.moduleName,
    date: observation.date.toISOString().slice(0, 10),
    authorUserId: observation.authorUserId,
    authorName: observation.authorName,
    createdAt: observation.createdAt.toISOString(),
    canEdit:
      observation.type !== 'cambio_proyecto' &&
      (observation.authorUserId === source.actorUserId || source.canManagePendings),
    canDelete:
      observation.type !== 'cambio_proyecto' &&
      observation.authorUserId === source.actorUserId &&
      source.now.getTime() - observation.createdAt.getTime() <= PROJECT_OBSERVATION_DELETE_WINDOW_MS,
    canResolve: source.canManagePendings,
  }));

  const modules: ProjectModuleDto[] = source.modules.map((module) => ({
    id: module.id,
    name: module.name,
    initialStage: module.initialStage,
    currentStage: module.currentStage,
    estimatedHours: module.estimatedHours,
    estimatedStartDate: module.estimatedStartDate?.toISOString().slice(0, 10) ?? null,
    estimatedEndDate: module.estimatedEndDate?.toISOString().slice(0, 10) ?? null,
    deliveries: module.deliveries.map((delivery) => ({
      id: delivery.id,
      teamId: delivery.teamId,
      teamName: delivery.teamName,
      estimatedDate: delivery.estimatedDate.toISOString().slice(0, 10),
      status: delivery.status,
    })),
    segments: module.segments.map((segment) => ({
      id: segment.id,
      teamId: segment.teamId,
      teamName: segment.teamName,
      name: segment.name,
      startDate: segment.startDate.toISOString().slice(0, 10),
      endDate: segment.endDate.toISOString().slice(0, 10),
    })),
    tasks: module.tasks.map((task) => ({
      id: task.id,
      teamId: task.teamId,
      teamName: task.teamName,
      assigneeUserId: task.assigneeUserId,
      assigneeName: task.assigneeName,
      name: task.name,
      description: task.description,
      startDate: task.startDate ? task.startDate.toISOString().slice(0, 10) : null,
      date: task.date.toISOString().slice(0, 10),
      estimatedHours: task.estimatedHours,
      status: task.status,
      scope: task.scope,
      completedAt: task.completedAt?.toISOString() ?? null,
    })),
    blockerCount: module.blockerCount,
  }));

  const paymentMilestones: ProjectPaymentMilestoneDto[] = source.paymentMilestones.map((milestone) => ({
    id: milestone.id,
    name: milestone.name,
    percent: milestone.percent,
    amount: milestone.amount,
    invoiceNumber: milestone.invoiceNumber,
    issuedAt: milestone.issuedAt?.toISOString().slice(0, 10) ?? null,
    status: milestone.status,
    paidAt: milestone.paidAt?.toISOString().slice(0, 10) ?? null,
    sortOrder: milestone.sortOrder,
  }));

  return {
    id: snapshot.id,
    name: snapshot.name,
    slug: snapshot.slug,
    client: snapshot.clientId ? { id: snapshot.clientId, companyName: source.client?.companyName ?? '' } : null,
    primaryContact: source.primaryContact,
    type: snapshot.type,
    salesStage: snapshot.salesStage,
    status: snapshot.status,
    phase: snapshot.phase,
    priority: snapshot.priority,
    leader: snapshot.leaderUserId ? { id: snapshot.leaderUserId, fullName: source.leader?.fullName ?? '' } : null,
    developer: snapshot.developerUserId
      ? { id: snapshot.developerUserId, fullName: source.developer?.fullName ?? '' }
      : null,
    commercialManager: snapshot.commercialManagerUserId
      ? { id: snapshot.commercialManagerUserId, fullName: source.commercialManager?.fullName ?? '' }
      : null,
    soldHours: Number(snapshot.soldHours),
    usedHours: Number(snapshot.usedHours),
    assignedMemberCount: members.length,
    plannedHours: members.reduce((sum, member) => sum + member.assignedHours, 0),
    startDate: snapshot.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: snapshot.endDate?.toISOString().slice(0, 10) ?? null,
    estimatedDeliveryDate: snapshot.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    expectedProgress: snapshot.expectedProgress,
    actualProgress: snapshot.actualProgress,
    supportPlanDescription: snapshot.supportPlanDescription,
    supportHours: Number(snapshot.supportHours),
    overtimeRateUf: Number(snapshot.overtimeRateUf),
    allowsOvertime: snapshot.allowsOvertime,
    canAuthorizeOvertime: source.canAuthorizeOvertime,
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
    impactBeforeHours: snapshot.impactBeforeHours,
    impactBeforePeople: snapshot.impactBeforePeople,
    impactBeforeDuration: snapshot.impactBeforeDuration,
    impactBeforeModality: snapshot.impactBeforeModality,
    impactAfterHours: snapshot.impactAfterHours,
    impactAfterPeople: snapshot.impactAfterPeople,
    impactAfterDuration: snapshot.impactAfterDuration,
    impactAfterModality: snapshot.impactAfterModality,
    qaTestingStartDate: snapshot.qaTestingStartDate?.toISOString().slice(0, 10) ?? null,
    qaTestingEndDate: snapshot.qaTestingEndDate?.toISOString().slice(0, 10) ?? null,
    qaEvaluatedModule: snapshot.qaEvaluatedModule,
    qaPlannedTests: snapshot.qaPlannedTests,
    qaExecutedTests: snapshot.qaExecutedTests,
    qaFailedTests: snapshot.qaFailedTests,
    periodReportDate: snapshot.periodReportDate?.toISOString().slice(0, 10) ?? null,
    periodReportAchievements: snapshot.periodReportAchievements,
    usedHoursUpdatedAt: source.usedHoursUpdatedAt?.toISOString().slice(0, 10) ?? null,
    pendingManagementApproval: source.project.pendingManagementApproval,
    paymentMilestones,
    teams,
    members,
    observations,
    modules,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
