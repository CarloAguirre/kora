import type { ProjectStatus } from '@kora/contracts';

export interface HourEntryProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
}

export interface HourEntryProjectReader {
  findById(projectId: string): Promise<HourEntryProjectReference | null>;
  findManyByIds(projectIds: readonly string[]): Promise<HourEntryProjectReference[]>;
  /** ¿Es líder del proyecto o líder de algún equipo asignado a él? */
  isProjectApprover(projectId: string, userId: string): Promise<boolean>;
}

export const HOUR_ENTRY_PROJECT_READER = Symbol('HourEntryProjectReader');
