import type {
  ProjectDetail,
  ProjectSummary,
  ProjectTeam as ProjectTeamDto,
  ProjectTeamMember as ProjectTeamMemberDto,
  ProjectObservation as ProjectObservationDto,
} from '@kora/contracts';
import type { Project } from '../../domain/entities/project.entity';
import type { ProjectListItem } from '../../domain/repositories/project.repository';
import type { ProjectTeamMemberRecord } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRecord } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_OBSERVATION_DELETE_WINDOW_MS,
  type ProjectObservationRecord,
} from '../../domain/repositories/project-observation.repository';
import type { ProjectUserReference } from '../ports/project-user-reader.port';
import type { ProjectClientReference } from '../ports/project-client-reader.port';
import type { ProjectContactReference } from '../ports/project-contact-reader.port';

export function toProjectSummary(item: ProjectListItem): ProjectSummary {
  return {
    id: item.id,
    name: item.name,
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
  readonly actorUserId: string;
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
    message: observation.message,
    authorUserId: observation.authorUserId,
    authorName: observation.authorName,
    createdAt: observation.createdAt.toISOString(),
    canEdit: observation.authorUserId === source.actorUserId,
    canDelete:
      observation.authorUserId === source.actorUserId &&
      source.now.getTime() - observation.createdAt.getTime() <= PROJECT_OBSERVATION_DELETE_WINDOW_MS,
  }));

  return {
    id: snapshot.id,
    name: snapshot.name,
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
    teams,
    members,
    observations,
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}
