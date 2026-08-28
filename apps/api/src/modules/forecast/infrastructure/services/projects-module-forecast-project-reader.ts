import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { ForecastProjectReader, ForecastProjectReference } from '../../application/ports/forecast-project-reader.port';

@Injectable()
export class ProjectsModuleForecastProjectReader implements ForecastProjectReader {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async findById(projectId: string): Promise<ForecastProjectReference | null> {
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return null;
    return { id: project.id, name: project.name };
  }
}
