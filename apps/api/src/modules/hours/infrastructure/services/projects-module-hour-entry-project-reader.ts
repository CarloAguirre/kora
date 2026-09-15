import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../../projects/domain/repositories/project-module.repository';
import type {
  HourEntryModuleReference,
  HourEntryProjectApprover,
  HourEntryProjectReader,
  HourEntryProjectReference,
} from '../../application/ports/hour-entry-project-reader.port';

@Injectable()
export class ProjectsModuleHourEntryProjectReader implements HourEntryProjectReader {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
  ) {}

  async findModuleById(moduleId: string): Promise<HourEntryModuleReference | null> {
    const module = await this.modules.findById(moduleId);
    if (!module) return null;
    return { id: module.id, name: module.name, projectId: module.projectId };
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
}
