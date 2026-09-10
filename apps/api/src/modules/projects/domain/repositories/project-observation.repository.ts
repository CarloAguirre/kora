import type { TransactionContext } from '@kora/core';

export interface ProjectObservationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly message: string;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly createdAt: Date;
}

export interface ProjectObservationRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectObservationRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectObservationRecord | null>;
  add(
    projectId: string,
    message: string,
    authorUserId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<string>;
  update(id: string, message: string, now: Date, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<void>;
}

export const PROJECT_OBSERVATION_REPOSITORY = Symbol('ProjectObservationRepository');

/** Solo quien creó la entrada puede borrarla, y solo dentro de este plazo desde su creación. La edición no tiene límite de tiempo. */
export const PROJECT_OBSERVATION_DELETE_WINDOW_MS = 15 * 60 * 1000;
