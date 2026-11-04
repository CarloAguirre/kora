import type { ExcludeRoadmapReferenceInput, RoadmapReferenceExclusion } from '@kora/contracts';

/** Persistencia de exclusiones SOLO operativas: la capa aplicación desconoce Drizzle. */
export interface RoadmapReferenceExclusionStore {
  list(projectId: string): Promise<RoadmapReferenceExclusion[]>;
  versionBelongsToProject(projectId: string, versionId: string): Promise<boolean>;
  suppress(projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput, actorUserId: string): Promise<void>;
  restore(projectId: string, moduleId: string, input: ExcludeRoadmapReferenceInput): Promise<void>;
}
export const ROADMAP_REFERENCE_EXCLUSION_STORE = Symbol('RoadmapReferenceExclusionStore');
