import type { TransactionContext } from '@kora/core';
import type { ExcludeRoadmapReferenceInput, RoadmapReferenceExclusion } from '@kora/contracts';

/** Persistencia de exclusiones SOLO operativas: la capa aplicación desconoce Drizzle. */
export interface RoadmapReferenceExclusionStore {
  list(projectId: string): Promise<RoadmapReferenceExclusion[]>;
  versionBelongsToProject(projectId: string, versionId: string): Promise<boolean>;
  suppress(projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput, actorUserId: string): Promise<void>;
  restore(projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput): Promise<void>;
  /** Suprime el bloque referencial del equipo SOLO para esta fase/versión
   * comercial. Se invoca en la misma transacción que elimina el bloque real. */
  suppressTeamBlock(projectId: string, moduleId: string, teamId: string,
    actorUserId: string, context?: TransactionContext): Promise<boolean>;
}
export const ROADMAP_REFERENCE_EXCLUSION_STORE = Symbol('RoadmapReferenceExclusionStore');
