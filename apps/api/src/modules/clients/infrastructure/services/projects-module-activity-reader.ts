import { Inject, Injectable } from '@nestjs/common';
import type { ProjectActivityReader } from '../../application/ports/project-activity-reader.port';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../../projects/domain/repositories/project.repository';

/**
 * Satisface `ProjectActivityReader` con el `ProjectsModule` real.
 *
 * Sustituye a `NullProjectActivityReader`. Desde ahora, desactivar un cliente
 * con proyectos activos exige la confirmación explícita que el caso de uso
 * `ChangeClientStatusUseCase` ya sabía pedir desde M1 — solo esperaba a que
 * hubiera un contador real detrás.
 */
@Injectable()
export class ProjectsModuleActivityReader implements ProjectActivityReader {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async countActiveProjectsForClient(clientId: string): Promise<number> {
    return this.projects.countActiveForClient(clientId);
  }
}
