import type { TransactionContext } from '@kora/core';
import type { ProjectObservationStatus, ProjectObservationType } from '@kora/contracts';

export interface ProjectObservationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly type: ProjectObservationType;
  readonly title: string | null;
  readonly message: string;
  readonly status: ProjectObservationStatus | null;
  readonly moduleId: string | null;
  readonly moduleName: string | null;
  readonly date: Date;
  /** Registro de activación del proyecto (Hito 0) — su `date` es la fecha del Hito 0. */
  readonly isHito0: boolean;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly createdAt: Date;
}

export interface AddProjectObservationData {
  readonly projectId: string;
  readonly type: ProjectObservationType;
  readonly title: string | null;
  readonly message: string;
  readonly status: ProjectObservationStatus | null;
  readonly moduleId: string | null;
  readonly date: Date;
  readonly isHito0?: boolean;
  readonly authorUserId: string;
  readonly now: Date;
}

export interface ProjectObservationRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectObservationRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectObservationRecord | null>;
  add(data: AddProjectObservationData, context?: TransactionContext): Promise<string>;
  update(id: string, message: string, now: Date, context?: TransactionContext): Promise<void>;
  updateStatus(id: string, status: ProjectObservationStatus, now: Date, context?: TransactionContext): Promise<void>;
  /** Alinea la fecha del registro de Hito 0 del proyecto (si existe) con una corrección de `hito0At`. */
  updateHito0Date(projectId: string, date: Date, now: Date, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<void>;
}

export const PROJECT_OBSERVATION_REPOSITORY = Symbol('ProjectObservationRepository');

/** Solo quien creó la entrada puede borrarla, y solo dentro de este plazo desde su creación. La edición no tiene límite de tiempo. */
export const PROJECT_OBSERVATION_DELETE_WINDOW_MS = 15 * 60 * 1000;
