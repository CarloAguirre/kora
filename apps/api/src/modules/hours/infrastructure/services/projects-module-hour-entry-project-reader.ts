import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@kora/core';
import { PROJECT_TEAM_MEMBER_REPOSITORY, type ProjectTeamMemberRepository } from '../../../projects/domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../../projects/domain/repositories/project-team.repository';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../../projects/domain/repositories/project-module.repository';
import type {
  HourEntryModuleReference,
  HourEntrySegmentReference,
  HourEntryProjectApprover,
  HourEntryProjectReader,
  HourEntryProjectReference,
} from '../../application/ports/hour-entry-project-reader.port';

@Injectable()
export class ProjectsModuleHourEntryProjectReader implements HourEntryProjectReader {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findModuleById(moduleId: string): Promise<HourEntryModuleReference | null> {
    const module = await this.modules.findById(moduleId);
    if (!module) return null;
    return {
      id: module.id,
      name: module.name,
      projectId: module.projectId,
      segments: module.segments.map((segment) => ({ id: segment.id, name: segment.name })),
      tasks: module.tasks.map((task) => ({
        id: task.id, name: task.name, segmentId: task.segmentId,
        assigneeUserId: task.assigneeUserId, cancelledAt: task.cancelledAt ?? null,
      })),
    };
  }

  async findSegmentsForModule(moduleId: string): Promise<HourEntrySegmentReference[]> {
    const module = await this.modules.findById(moduleId);
    if (!module) return [];
    return module.segments.map((segment) => ({
      id: segment.id, name: segment.name, moduleId: module.id,
      projectId: module.projectId, teamId: segment.teamId,
    }));
  }

  async hasAttributableWorkBlocks(projectId: string, userId: string): Promise<boolean> {
    const [modules, members, teams] = await Promise.all([
      this.modules.listForProject(projectId),
      this.members.listForProject(projectId),
      this.projectTeams.findByProject(projectId),
    ]);
    const participatingTeams = new Set([
      ...members.filter((member) => member.userId === userId && !member.blockedAt)
        .map((member) => member.teamId),
      ...teams.filter((team) => team.leaderUserId === userId)
        .map((team) => team.teamId),
    ]);
    return modules.some((module) =>
      module.segments.some((segment) => participatingTeams.has(segment.teamId)));
  }

  async isUserOnSegmentTeam(projectId: string, teamId: string, userId: string): Promise<boolean> {
    const [members, teams] = await Promise.all([
      this.members.listForProject(projectId),
      this.projectTeams.findByProject(projectId),
    ]);
    return members.some((member) => member.teamId === teamId && member.userId === userId && !member.blockedAt) ||
      teams.some((team) => team.teamId === teamId && team.leaderUserId === userId);
  }

  async findById(projectId: string): Promise<HourEntryProjectReference | null> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return null;
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      leaderUserId: project.leaderUserId,
      allowsOvertime: project.allowsOvertime,
    };
  }

  async findManyByIds(projectIds: readonly string[]): Promise<HourEntryProjectReference[]> {
    const results = await Promise.all(projectIds.map((id) => this.findById(id)));
    return results.filter((project): project is HourEntryProjectReference => project !== null);
  }

  isProjectApprover(projectId: string, actorUserId: string, memberUserId: string): Promise<boolean> {
    return this.projects.isProjectLeaderOrTeamLeaderOfMember(projectId, actorUserId, memberUserId);
  }

  findApprovers(projectId: string, memberUserId: string): Promise<HourEntryProjectApprover[]> {
    return this.projects.findApproverCandidatesForMember(projectId, memberUserId);
  }

  async recalculateUsedHours(projectId: string, usedHours: number): Promise<void> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return;
    project.recordUsedHours(usedHours, this.clock.now());
    await this.projects.save(project);
  }
}
