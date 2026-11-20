import { Inject, Injectable } from '@nestjs/common';
import {
  and, desc, eq, inArray, projectQuotations, quotationVersions, quotationEvents,
  projectRoadmapReferenceExclusions, type Database,
} from '@kora/db';
import { ROADMAP_REMOVED_TEAM_BLOCK_WBS, type ExcludeRoadmapReferenceInput, type RoadmapReferenceExclusion } from '@kora/contracts';
import type { TransactionContext } from '@kora/core';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
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

  async suppressTeamBlock(
    projectId: string, moduleId: string, teamId: string,
    actorUserId: string, context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.db, context);
    // Debe corresponder al traspaso vigente y al ID EXACTO de esta fase.
    // Sin fuente comercial no existe nada que suprimir.
    const [applied] = await db.select({
      versionId: quotationEvents.versionId,
      metadata: quotationEvents.metadata,
    }).from(quotationEvents)
      .innerJoin(quotationVersions, eq(quotationVersions.id, quotationEvents.versionId))
      .innerJoin(projectQuotations, eq(projectQuotations.id, quotationVersions.quotationId))
      .where(and(eq(projectQuotations.projectId, projectId),
        inArray(quotationEvents.action, ['quotation_transferred', 'planning_baseline_applied'])))
      .orderBy(desc(quotationEvents.occurredAt)).limit(1);
    const modules = (applied?.metadata as { moduleIds?: unknown } | undefined)?.moduleIds;
    if (!applied || !Array.isArray(modules) || !modules.includes(moduleId)) return false;
    await db.insert(projectRoadmapReferenceExclusions).values({
      projectId, moduleId, versionId: applied.versionId,
      wbs: ROADMAP_REMOVED_TEAM_BLOCK_WBS, role: teamId,
      actorUserId,
    }).onConflictDoNothing();
    return true;
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
