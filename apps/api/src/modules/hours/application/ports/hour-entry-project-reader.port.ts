import type { ProjectStatus } from '@kora/contracts';

export interface HourEntryProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly leaderUserId: string | null;
  readonly allowsOvertime: boolean;
}

export interface HourEntryProjectApprover {
  readonly id: string;
  readonly fullName: string;
}

export interface HourEntryProjectReader {
  findById(projectId: string): Promise<HourEntryProjectReference | null>;
  findManyByIds(projectIds: readonly string[]): Promise<HourEntryProjectReference[]>;
  /** ¿Es líder del proyecto, o líder del equipo (asignado al proyecto) del que `memberUserId` es miembro activo? */
  isProjectApprover(projectId: string, actorUserId: string, memberUserId: string): Promise<boolean>;
  /** Líder del proyecto + líder del equipo del propio autor — mismo criterio que `isProjectApprover`, pero enumerado. */
  findApprovers(projectId: string, memberUserId: string): Promise<HourEntryProjectApprover[]>;
}

export const HOUR_ENTRY_PROJECT_READER = Symbol('HourEntryProjectReader');
