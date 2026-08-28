import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { HourEntryProjectReader, HourEntryProjectReference } from '../../application/ports/hour-entry-project-reader.port';

@Injectable()
export class ProjectsModuleHourEntryProjectReader implements HourEntryProjectReader {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async findById(projectId: string): Promise<HourEntryProjectReference | null> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return null;
    return { id: project.id, name: project.name, status: project.status };
  }

  async findManyByIds(projectIds: readonly string[]): Promise<HourEntryProjectReference[]> {
    const results = await Promise.all(projectIds.map((id) => this.findById(id)));
    return results.filter((project): project is HourEntryProjectReference => project !== null);
  }

  isProjectApprover(projectId: string, userId: string): Promise<boolean> {
    return this.projects.isProjectLeaderOrTeamLeader(projectId, userId);
  }
}
