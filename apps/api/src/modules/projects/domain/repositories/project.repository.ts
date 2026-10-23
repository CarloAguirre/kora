import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { ProjectPhase, ProjectStatus, ProjectType } from '@kora/contracts';
import type { Project } from '../entities/project.entity';

export interface ProjectFilters {
  readonly search?: string | undefined;
  readonly type?: ProjectType | undefined;
  readonly status?: readonly ProjectStatus[] | undefined;
  readonly phase?: readonly ProjectPhase[] | undefined;
  readonly clientId?: string | undefined;
  readonly clientIds?: readonly string[] | undefined;
  /** Proyectos cuyo rango Inicio–Fin se cruza con alguno de estos períodos (`YYYY-MM-DD`, ambos extremos incluidos). */
  readonly periods?: readonly { readonly from: string; readonly to: string }[] | undefined;
  readonly leaderUserId?: readonly string[] | undefined;
  /** Filtra a proyectos donde el usuario participa (líder, desarrollador o miembro asignado). */
  readonly assignedToUserId?: string | undefined;
  /** Filtra a proyectos con al menos un miembro de este equipo asignado. */
  readonly teamId?: string | undefined;
  readonly includeDeleted?: boolean | undefined;
}

export type ProjectSortableField =
  | 'name'
  | 'status'
  | 'priority'
  | 'createdAt'
  | 'client'
  | 'leader'
  | 'startDate'
  | 'endDate'
  | 'progress'
  | 'soldHours'
  | 'usedHours'
  | 'remainingHours'
  | 'supportHours'
  | 'supportPlan'
  | 'deviationHours';

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly type: ProjectType;
  readonly salesStage: string | null;
  readonly status: ProjectStatus;
  readonly phase: string | null;
  readonly priority: string | null;
  readonly leaderUserId: string | null;
  readonly leaderName: string | null;
  readonly commercialManagerUserId: string | null;
  readonly commercialManagerName: string | null;
  readonly soldHours: number;
  readonly usedHours: number;
  readonly assignedMemberCount: number;
  readonly plannedHours: number;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  /** Ver `projectDetailSchema.stopsClock` — el avance (`calculateProjectProgress`) no evalúa Retraso con el reloj pausado. */
  readonly stopsClock: boolean;
  readonly supportPlanDescription: string | null;
  /** Ver `projectSummarySchema.supportPlanType`. */
  readonly supportPlanType: 'monthly' | 'bundle' | 'on_demand' | null;
  readonly supportHours: number;
  readonly allowsOvertime: boolean;
  readonly createdAt: Date;
}

export interface ProjectRepository {
  findById(id: string, context?: TransactionContext): Promise<Project | null>;
  findBySlug(slug: string, context?: TransactionContext): Promise<Project | null>;
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

  /**
   * ¿Puede `actorUserId` decidir/gestionar algo de `memberUserId` en este
   * proyecto? EXCLUYENTE: si `memberUserId` tiene líder de equipo resoluble
   * para este proyecto (override `project_teams.leaderUserId`, o el líder
   * orgánico del equipo como respaldo), SOLO ese líder puede decidir — el
   * líder del proyecto queda excluido de la decisión directa (sigue pudiendo
   * verlas, ver `findApproverCandidatesForMember`). El líder del proyecto
   * solo recupera la potestad de decidir cuando no hay líder de equipo
   * resoluble — incluido el caso `memberUserId === null` (nada que resolver:
   * sin persona no hay equipo que consultar), que Tickets usa para un ticket
   * sin responsable asignado. Genérico a propósito: Horas lo usa para el
   * dueño del registro, Tickets para el responsable del ticket — misma
   * pregunta ("¿quién decide por esta persona en este proyecto?"), dos
   * módulos.
   */
  isProjectLeaderOrTeamLeaderOfMember(
    projectId: string,
    actorUserId: string,
    memberUserId: string | null,
    context?: TransactionContext,
  ): Promise<boolean>;

  /** Mismo criterio EXCLUYENTE que `isProjectLeaderOrTeamLeaderOfMember`, pero enumerado — alimenta la columna "Aprobador" del historial de horas y el resumen de pendientes del líder de proyecto. */
  findApproverCandidatesForMember(
    projectId: string,
    memberUserId: string | null,
    context?: TransactionContext,
  ): Promise<{ id: string; fullName: string }[]>;
}

export const PROJECT_REPOSITORY = Symbol('ProjectRepository');
