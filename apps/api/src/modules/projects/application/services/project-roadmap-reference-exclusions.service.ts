import { ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import {
  and, eq, projectQuotations, quotationVersions, projectRoadmapReferenceExclusions,
  type Database,
} from '@kora/db';
import type { ExcludeRoadmapReferenceInput, RoadmapReferenceExclusion } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import type { RequestUser } from '../../../../shared/presentation/decorators/current-user.decorator';
import { unwrapOrThrow } from '../../../../shared/presentation/unwrap-result';
import { GetProjectUseCase } from '../use-cases/get-project.use-case';

/** Separar decisiones del Roadmap de la versión aprobada de cotización.
 * No se borra la fuente EDT ni se crea una tarea operativa ficticia.
 */
@Injectable()
export class ProjectRoadmapReferenceExclusionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly getProject: GetProjectUseCase,
  ) {}

  private async access(projectId: string, actor: RequestUser) {
    return unwrapOrThrow(await this.getProject.execute({
      projectId, actorUserId: actor.id, actorPermissions: actor.permissions,
    }));
  }

  async list(projectId: string, actor: RequestUser): Promise<RoadmapReferenceExclusion[]> {
    const project = await this.access(projectId, actor);
    return this.db.select({
      moduleId: projectRoadmapReferenceExclusions.moduleId,
      versionId: projectRoadmapReferenceExclusions.versionId,
      wbs: projectRoadmapReferenceExclusions.wbs,
      role: projectRoadmapReferenceExclusions.role,
    }).from(projectRoadmapReferenceExclusions)
      .where(eq(projectRoadmapReferenceExclusions.projectId, project.id));
  }

  async suppress(
    projectId: string, moduleId: string,
    input: ExcludeRoadmapReferenceInput, actor: RequestUser,
  ): Promise<void> {
    const project = await this.access(projectId, actor);
    if (!actor.permissions.includes('projects:manage') && project.leader?.id !== actor.id) {
      throw new ForbiddenException('Solo el líder del proyecto o PMO puede excluir una tarea del Roadmap.');
    }
    if (!project.modules.some((module) => module.id === moduleId)) {
      throw new NotFoundException('La fase no pertenece a este proyecto.');
    }
    const [version] = await this.db.select({ id: quotationVersions.id })
      .from(quotationVersions)
      .innerJoin(projectQuotations, eq(quotationVersions.quotationId, projectQuotations.id))
      .where(and(eq(projectQuotations.projectId, project.id),
        eq(quotationVersions.id, input.versionId)))
      .limit(1);
    if (!version) throw new NotFoundException('La versión de cotización no pertenece a este proyecto.');

    await this.db.insert(projectRoadmapReferenceExclusions).values({
      projectId: project.id, moduleId,
      versionId: input.versionId, wbs: input.wbs, role: input.role,
      actorUserId: actor.id,
    }).onConflictDoNothing();
  }

  async restore(
    projectId: string, moduleId: string,
    input: ExcludeRoadmapReferenceInput, actor: RequestUser,
  ): Promise<void> {
    const project = await this.access(projectId, actor);
    if (!actor.permissions.includes('projects:manage') && project.leader?.id !== actor.id) {
      throw new ForbiddenException('No tienes permiso para restaurar referencias del Roadmap.');
    }
    await this.db.delete(projectRoadmapReferenceExclusions).where(and(
      eq(projectRoadmapReferenceExclusions.projectId, project.id),
      eq(projectRoadmapReferenceExclusions.moduleId, moduleId),
      eq(projectRoadmapReferenceExclusions.versionId, input.versionId),
      eq(projectRoadmapReferenceExclusions.wbs, input.wbs),
      eq(projectRoadmapReferenceExclusions.role, input.role),
    ));
  }
}
