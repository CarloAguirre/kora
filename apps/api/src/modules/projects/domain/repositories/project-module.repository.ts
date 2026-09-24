import type { TransactionContext } from '@kora/core';
import type {
  ProjectModuleStage,
  ProjectModuleDeliveryStatus,
  ProjectModuleTaskStatus,
  ProjectModuleTaskScope,
} from '@kora/contracts';

export interface ProjectModuleDeliveryRecord {
  readonly id: string;
  readonly moduleId: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly estimatedDate: Date;
  readonly status: ProjectModuleDeliveryStatus;
  readonly rejectionReason: string | null;
}

export interface ProjectModuleSegmentRecord {
  readonly id: string;
  readonly moduleId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface ProjectModuleTaskRecord {
  readonly id: string;
  readonly moduleId: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly startDate: Date | null;
  readonly date: Date;
  readonly estimatedHours: number | null;
  readonly status: ProjectModuleTaskStatus;
  readonly scope: ProjectModuleTaskScope;
  readonly completedAt: Date | null;
  readonly rejectionReason: string | null;
}

export interface ProjectModuleRecord {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly initialStage: ProjectModuleStage;
  readonly currentStage: ProjectModuleStage;
  readonly estimatedHours: number | null;
  readonly estimatedStartDate: Date | null;
  readonly estimatedEndDate: Date | null;
  readonly deliveries: readonly ProjectModuleDeliveryRecord[];
  readonly segments: readonly ProjectModuleSegmentRecord[];
  readonly tasks: readonly ProjectModuleTaskRecord[];
  /** Cantidad de registros de horas con `hasBlocker` contra este módulo. */
  readonly blockerCount: number;
}

export interface CreateProjectModuleInput {
  readonly projectId: string;
  readonly name: string;
  readonly initialStage: ProjectModuleStage;
  readonly estimatedHours: number | null;
  readonly estimatedStartDate: Date | null;
  readonly estimatedEndDate: Date | null;
}

export interface UpdateProjectModuleInput {
  readonly name?: string;
  readonly currentStage?: ProjectModuleStage;
  readonly estimatedHours?: number | null;
  readonly estimatedStartDate?: Date | null;
  readonly estimatedEndDate?: Date | null;
}

export interface CreateProjectModuleSegmentInput {
  readonly moduleId: string;
  readonly teamId: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
}

export interface UpdateProjectModuleSegmentInput {
  readonly teamId?: string;
  readonly name?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

export interface CreateProjectModuleTaskInput {
  readonly moduleId: string;
  readonly teamId: string | null;
  readonly assigneeUserId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly startDate: Date | null;
  readonly date: Date;
  readonly estimatedHours: number | null;
  readonly status: ProjectModuleTaskStatus;
  readonly scope: ProjectModuleTaskScope;
}

export interface UpdateProjectModuleTaskInput {
  readonly teamId?: string | null;
  readonly assigneeUserId?: string | null;
  readonly name?: string;
  readonly description?: string | null;
  readonly startDate?: Date | null;
  readonly date?: Date;
  readonly estimatedHours?: number | null;
  readonly status?: ProjectModuleTaskStatus;
  readonly scope?: ProjectModuleTaskScope;
  readonly completedAt?: Date | null;
  readonly rejectionReason?: string | null;
}

export interface CreateProjectModuleDeliveryInput {
  readonly moduleId: string;
  readonly teamId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly assigneeUserId: string | null;
  readonly estimatedDate: Date;
}

export interface UpdateProjectModuleDeliveryInput {
  readonly teamId?: string | null;
  readonly name?: string;
  readonly description?: string | null;
  readonly assigneeUserId?: string | null;
  readonly status?: ProjectModuleDeliveryStatus;
  readonly estimatedDate?: Date;
  readonly rejectionReason?: string | null;
}

/** Fila de "Mis tareas" — tarea asignada a una persona, con el nombre de su proyecto/módulo. */
export interface TaskAssignedToUserRecord {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly name: string;
  readonly date: Date;
  readonly status: ProjectModuleTaskStatus;
  readonly completedAt: Date | null;
  readonly rejectionReason: string | null;
}

/** Fila de "Mis entregas" — entrega asignada a una persona, con el nombre de su proyecto/módulo. */
export interface DeliveryAssignedToUserRecord {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly estimatedDate: Date;
  readonly status: ProjectModuleDeliveryStatus;
  readonly rejectionReason: string | null;
}

/** Fases/módulos del proyecto — sin entidad de agregado propia, igual patrón que `ProjectObservationRepository`. */
export interface ProjectModuleRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectModuleRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectModuleRecord | null>;
  create(input: CreateProjectModuleInput, now: Date, context?: TransactionContext): Promise<string>;
  update(id: string, input: UpdateProjectModuleInput, now: Date, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<void>;
  addDelivery(input: CreateProjectModuleDeliveryInput, now: Date, context?: TransactionContext): Promise<string>;
  updateDelivery(
    id: string,
    input: UpdateProjectModuleDeliveryInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void>;
  removeDelivery(deliveryId: string, context?: TransactionContext): Promise<void>;
  addSegment(input: CreateProjectModuleSegmentInput, now: Date, context?: TransactionContext): Promise<string>;
  updateSegment(
    id: string,
    input: UpdateProjectModuleSegmentInput,
    now: Date,
    context?: TransactionContext,
  ): Promise<void>;
  removeSegment(id: string, context?: TransactionContext): Promise<void>;
  addTask(input: CreateProjectModuleTaskInput, now: Date, context?: TransactionContext): Promise<string>;
  updateTask(id: string, input: UpdateProjectModuleTaskInput, now: Date, context?: TransactionContext): Promise<void>;
  removeTask(id: string, context?: TransactionContext): Promise<void>;
  listTasksAssignedToUser(userId: string, context?: TransactionContext): Promise<TaskAssignedToUserRecord[]>;
  listDeliveriesAssignedToUser(userId: string, context?: TransactionContext): Promise<DeliveryAssignedToUserRecord[]>;
}

export const PROJECT_MODULE_REPOSITORY = Symbol('ProjectModuleRepository');
