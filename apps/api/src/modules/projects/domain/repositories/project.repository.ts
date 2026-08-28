import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { ProjectPhase, ProjectStatus, ProjectType } from '@kora/contracts';
import type { Project } from '../entities/project.entity';

export interface ProjectFilters {
  readonly search?: string | undefined;
  readonly type?: ProjectType | undefined;
  readonly status?: readonly ProjectStatus[] | undefined;
  readonly phase?: readonly ProjectPhase[] | undefined;
  readonly clientId?: string | undefined;
  readonly leaderUserId?: readonly string[] | undefined;
  /** Filtra a proyectos donde el usuario participa (líder, desarrollador o miembro asignado). */
  readonly assignedToUserId?: string | undefined;
  /** Filtra a proyectos con al menos un miembro de este equipo asignado. */
  readonly teamId?: string | undefined;
  readonly includeDeleted?: boolean | undefined;
}

export type ProjectSortableField = 'name' | 'status' | 'priority' | 'createdAt';

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly type: ProjectType;
  readonly salesStage: string | null;
  readonly status: ProjectStatus;
  readonly phase: string | null;
  readonly priority: string | null;
  readonly leaderUserId: string | null;
  readonly leaderName: string | null;
  readonly soldHours: number;
  readonly usedHours: number;
  readonly assignedMemberCount: number;
  readonly plannedHours: number;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly actualProgress: number | null;
  readonly supportPlanDescription: string | null;
  readonly supportHours: number;
  readonly createdAt: Date;
}

export interface ProjectRepository {
  findById(id: string, context?: TransactionContext): Promise<Project | null>;
  findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Project | null>;

  search(
    filters: ProjectFilters,
    page: PageRequest,
    sort: SortRequest<ProjectSortableField>,
    context?: TransactionContext,
  ): Promise<Page<ProjectListItem>>;

  save(project: Project, context?: TransactionContext): Promise<void>;

  nameIsTakenByAnother(
    name: string,
    clientId: string | null,
    excludingProjectId: string | null,
    context?: TransactionContext,
  ): Promise<boolean>;

  /** Cuántos proyectos activos (status='active') tiene un cliente. Satisface el puerto del módulo de clientes. */
  countActiveForClient(clientId: string, context?: TransactionContext): Promise<number>;

  /** Cuántos proyectos activos lidera o tiene asignados un usuario. Satisface `LeaderProfileResolver`. */
  countActiveLedByUser(userId: string, context?: TransactionContext): Promise<number>;

  /** ¿Lidera el proyecto, o lidera algún equipo asignado a él? Satisface la autoridad de aprobación de M4. */
  isProjectLeaderOrTeamLeader(projectId: string, userId: string, context?: TransactionContext): Promise<boolean>;
}

export const PROJECT_REPOSITORY = Symbol('ProjectRepository');
