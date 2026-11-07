import { ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { ExcludeRoadmapReferenceInput, Permission, RoadmapReferenceExclusion } from '@kora/contracts';
import { ROADMAP_REFERENCE_EXCLUSION_STORE, type RoadmapReferenceExclusionStore } from '../ports/roadmap-reference-exclusion-store.port';
import { unwrapOrThrow } from '../../../../shared/presentation/unwrap-result';
import { GetProjectUseCase } from '../use-cases/get-project.use-case';

/** Actor mínimo de aplicación, sin dependencia de la capa HTTP/presentación. */
interface RoadmapReferenceActor {
  readonly id: string;
  readonly permissions: readonly Permission[];
}

/** Separar decisiones del Roadmap de la versión aprobada de cotización.
 * No se borra la fuente EDT ni se crea una tarea operativa ficticia.
 */
@Injectable()
export class ProjectRoadmapReferenceExclusionsService {
  constructor(
    @Inject(ROADMAP_REFERENCE_EXCLUSION_STORE) private readonly store: RoadmapReferenceExclusionStore,
    private readonly getProject: GetProjectUseCase,
  ) {}

  private async access(projectId: string, actor: RoadmapReferenceActor) {
    return unwrapOrThrow(await this.getProject.execute({
      projectId, actorUserId: actor.id, actorPermissions: actor.permissions,
    }));
  }

  async list(projectId: string, actor: RoadmapReferenceActor): Promise<RoadmapReferenceExclusion[]> {
    const project = await this.access(projectId, actor);
    return this.store.list(project.id);
  }

  async suppress(
    projectId: string, moduleId: string,
    input: ExcludeRoadmapReferenceInput, actor: RoadmapReferenceActor,
  ): Promise<void> {
    const project = await this.access(projectId, actor);
    if (!actor.permissions.includes('projects:manage') && project.leader?.id !== actor.id) {
      throw new ForbiddenException('Solo el líder del proyecto o PMO puede excluir una tarea del Roadmap.');
    }
    if (!project.modules.some((module) => module.id === moduleId)) {
      throw new NotFoundException('La fase no pertenece a este proyecto.');
    }
    const validVersion = await this.store.versionBelongsToProject(project.id, input.versionId);
    if (!validVersion) throw new NotFoundException('La versión de cotización no pertenece a este proyecto.');
    await this.store.suppress(project.id, moduleId, input, actor.id);
  }

  async restore(
    projectId: string, moduleId: string,
    input: ExcludeRoadmapReferenceInput, actor: RoadmapReferenceActor,
  ): Promise<void> {
    const project = await this.access(projectId, actor);
    if (!actor.permissions.includes('projects:manage') && project.leader?.id !== actor.id) {
      throw new ForbiddenException('No tienes permiso para restaurar referencias del Roadmap.');
    }
    if (!project.modules.some((module) => module.id === moduleId)) {
      throw new NotFoundException('La fase no pertenece a este proyecto.');
    }
    await this.store.restore(project.id, moduleId, input);
  }
}
