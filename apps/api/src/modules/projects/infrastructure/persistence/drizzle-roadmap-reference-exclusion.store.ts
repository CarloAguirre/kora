import { Inject, Injectable } from '@nestjs/common';
import {
  and, eq, projectQuotations, quotationVersions,
  projectRoadmapReferenceExclusions, type Database,
} from '@kora/db';
import type { ExcludeRoadmapReferenceInput, RoadmapReferenceExclusion } from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import type { RoadmapReferenceExclusionStore } from '../../application/ports/roadmap-reference-exclusion-store.port';

/** Única dependencia de Drizzle; la aplicación trabaja con el puerto. */
@Injectable()
export class DrizzleRoadmapReferenceExclusionStore implements RoadmapReferenceExclusionStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(projectId: string): Promise<RoadmapReferenceExclusion[]> {
    return this.db.select({
      moduleId: projectRoadmapReferenceExclusions.moduleId,
      versionId: projectRoadmapReferenceExclusions.versionId,
      wbs: projectRoadmapReferenceExclusions.wbs,
      role: projectRoadmapReferenceExclusions.role,
    }).from(projectRoadmapReferenceExclusions)
      .where(eq(projectRoadmapReferenceExclusions.projectId, projectId));
  }

  async versionBelongsToProject(projectId: string, versionId: string): Promise<boolean> {
    const [version] = await this.db.select({ id: quotationVersions.id })
      .from(quotationVersions)
      .innerJoin(projectQuotations, eq(quotationVersions.quotationId, projectQuotations.id))
      .where(and(eq(projectQuotations.projectId, projectId),
        eq(quotationVersions.id, versionId)))
      .limit(1);
    return Boolean(version);
  }

  async suppress(
    projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput,
    actorUserId: string,
  ): Promise<void> {
    await this.db.insert(projectRoadmapReferenceExclusions).values({
      projectId, moduleId,
      versionId: input.versionId, wbs: input.wbs, role: input.role,
      actorUserId,
    }).onConflictDoNothing();
  }

  async restore(projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput): Promise<void> {
    await this.db.delete(projectRoadmapReferenceExclusions).where(and(
      eq(projectRoadmapReferenceExclusions.projectId, projectId),
      eq(projectRoadmapReferenceExclusions.moduleId, moduleId),
      eq(projectRoadmapReferenceExclusions.versionId, input.versionId),
      eq(projectRoadmapReferenceExclusions.wbs, input.wbs),
      eq(projectRoadmapReferenceExclusions.role, input.role),
    ));
  }
}
