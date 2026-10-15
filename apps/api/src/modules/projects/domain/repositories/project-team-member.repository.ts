import type { TransactionContext } from '@kora/core';
import type { UserStatus } from '@kora/contracts';

export interface ProjectTeamMemberRecord {
  readonly id: string;
  readonly projectId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamMemberId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly userStatus: UserStatus;
  readonly activity: string | null;
  readonly assignedHours: number;
  readonly consumedHours: number;
}

export interface AssignProjectTeamMemberRecord {
  readonly projectId: string;
  /** El equipo se resuelve en persistencia a partir de `teamMemberId`: no hace falta pedirlo aparte. */
  readonly teamMemberId: string;
  readonly activity: string | null;
  readonly assignedHours: number;
}

export interface UpdateProjectTeamMemberPatch {
  readonly activity?: string | null;
  readonly assignedHours?: number;
}

export interface ProjectTeamMemberRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectTeamMemberRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectTeamMemberRecord | null>;
  findByProjectAndTeamMember(
    projectId: string,
    teamMemberId: string,
    context?: TransactionContext,
  ): Promise<ProjectTeamMemberRecord | null>;

  assign(record: AssignProjectTeamMemberRecord, context?: TransactionContext): Promise<string>;
  unassign(id: string, context?: TransactionContext): Promise<void>;
  update(id: string, patch: UpdateProjectTeamMemberPatch, context?: TransactionContext): Promise<void>;
}

export const PROJECT_TEAM_MEMBER_REPOSITORY = Symbol('ProjectTeamMemberRepository');
