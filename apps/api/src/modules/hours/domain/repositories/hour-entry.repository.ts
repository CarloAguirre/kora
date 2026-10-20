import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { HourEntryStatus, ProjectType } from '@kora/contracts';
import type { HourEntry } from '../entities/hour-entry.entity';

export interface HourEntryFilters {
  readonly userId?: string | undefined;
  /** Filtra por nombre del autor (ilike sobre nombre/apellido). */
  readonly search?: string | undefined;
  /** Acota a autores con membresía activa en este equipo. */
  readonly teamId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly status?: HourEntryStatus | undefined;
  readonly dateFrom?: Date | undefined;
  readonly dateTo?: Date | undefined;
  /** Alcance de visibilidad ya resuelto por el caso de uso (propias, del equipo, todas). */
  readonly visibleToUserIds?: readonly string[] | undefined;
  /**
   * Alcance de `hours:read_team`, EXCLUYENTE y por fila — no un set plano de
   * ids como `visibleToUserIds`, porque un mismo colaborador puede tener
   * horas en un proyecto donde `leaderScopeUserId` lidera su equipo y en
   * otro donde no (líder de "Desarrollo" en el Proyecto A ≠ líder de
   * "Desarrollo" en el Proyecto B: `project_teams.leaderUserId` es por
   * proyecto). Visible si la fila es propia, o si es de un colaborador cuyo
   * equipo activo lidera `leaderScopeUserId` (registro sin proyecto), o si
   * `leaderScopeUserId` es quien decidiría ESE registro puntual (mismo
   * criterio que `ProjectRepository.isProjectLeaderOrTeamLeaderOfMember` —
   * ver DECISION-M4-HORAS.md). Reemplaza a `visibleToUserIds` para
   * `hours:read_team`; no se combinan.
   */
  readonly leaderScopeUserId?: string | undefined;
  /** Deja fuera los registros de este autor — p.ej. los propios al contar "horas por aprobar", que decide otro. */
  readonly excludeUserId?: string | undefined;
}

export interface HourEntrySummary {
  readonly entries: number;
  readonly hours: number;
}

export type HourEntrySortableField = 'date' | 'createdAt' | 'status' | 'hours';

export interface HourEntryListItem {
  readonly id: string;
  readonly userId: string;
  readonly userFullName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly moduleId: string | null;
  readonly moduleName: string | null;
  /** Equipo activo del autor al momento de listar — no es histórico, refleja la membresía actual. */
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly assignment: string | null;
  readonly category: string;
  readonly description: string;
  readonly hours: number;
  readonly date: Date;
  readonly isOvertime: boolean;
  readonly projectStageAtEntry: string | null;
  readonly status: HourEntryStatus;
  readonly rejectionReason: string | null;
  readonly hasBlocker: boolean;
  readonly blockerDescription: string | null;
  readonly designatedApproverUserId: string | null;
  readonly designatedApproverFullName: string | null;
  /** Líder del proyecto + líder del equipo del propio autor (si está asignado al proyecto), cuando `projectId` no es null. */
  readonly projectApprovers: readonly { id: string; fullName: string }[];
  readonly createdAt: Date;
  /** Si este registro viene de una solicitud de HH de ticket (`ticket_hh_requests.hourEntryId`), el ticket de origen — para mostrar "Ticket TK-0001" en la cola general de aprobaciones. */
  readonly ticket: { id: string; legacyId: string | null } | null;
  /** Quién aprobó/rechazó el registro — alimenta el reporte de Capacity ("Responsable"). */
  readonly decisionUserId: string | null;
  readonly decisionByFullName: string | null;
  /** Cliente y tipo del proyecto asociado — alimenta el reporte de Capacity. */
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly projectType: ProjectType | null;
  readonly projectSalesStage: string | null;
}

/** Horas extra no rechazadas de un autor, separadas en aprobadas y pendientes. */
export interface OvertimeHoursByUser {
  readonly userId: string;
  readonly userFullName: string;
  readonly approvedHours: number;
  readonly pendingHours: number;
}

/** Horas extra no rechazadas de un autor en un proyecto, con el líder del proyecto. */
export interface OvertimeHoursByProjectAndUser {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectType: ProjectType;
  readonly leaderUserId: string | null;
  readonly leaderFullName: string | null;
  readonly userId: string;
  readonly userFullName: string;
  readonly approvedHours: number;
  readonly pendingHours: number;
}

export interface HourEntryRepository {
  findById(id: string, context?: TransactionContext): Promise<HourEntry | null>;
  findByLegacyId(legacyId: string, context?: TransactionContext): Promise<HourEntry | null>;

  search(
    filters: HourEntryFilters,
    page: PageRequest,
    sort: SortRequest<HourEntrySortableField>,
    context?: TransactionContext,
  ): Promise<Page<HourEntryListItem>>;

  /** Cuántos registros calzan con `filters` y cuántas horas suman — agregación en SQL, sin paginar. */
  summarize(filters: HourEntryFilters, context?: TransactionContext): Promise<HourEntrySummary>;

  save(entry: HourEntry, context?: TransactionContext): Promise<void>;

  delete(id: string, context?: TransactionContext): Promise<void>;

  /** Suma de horas aprobadas de un proyecto — alimenta `projects.used_hours`. */
  sumApprovedHoursForProject(projectId: string, context?: TransactionContext): Promise<number>;

  /**
   * Suma de horas aprobadas de varios proyectos en un rango de fechas —
   * agregación real (`SUM` en SQL), no `search()` paginado: `search()` trunca
   * en 2000 filas (`HOUR_ENTRY_PAGE_SIZE` en `GetSupportPlanSummaryUseCase`),
   * tolerable para un gráfico de consumo pero no para un monto a cobrar
   * (`SupportBillingCalculator`), donde truncar significa sub-facturar sin aviso.
   */
  sumApprovedHoursForProjects(
    projectIds: readonly string[],
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<number>;

  /**
   * Horas extra (no rechazadas) por autor en varios proyectos y un rango de
   * fechas — agregación en SQL, alimenta "Horas extra del mes" en la tab
   * Soporte del Dashboard. Ordenado de mayor a menor total.
   */
  sumOvertimeHoursByUserForProjects(
    projectIds: readonly string[],
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<OvertimeHoursByUser[]>;

  /**
   * Horas extra (no rechazadas) por proyecto × autor, en todos los proyectos
   * (soporte y desarrollo) y un rango de fechas — alimenta "Horas Extras" de
   * Administración. Agregación en SQL.
   */
  sumOvertimeHoursByProjectAndUser(
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<OvertimeHoursByProjectAndUser[]>;

  /** Horas normales (no extra) y no rechazadas que `userId` ya tiene registradas para `date` (cualquier asignación/proyecto) — decide qué parte de una solicitud de HH de ticket cabe en la jornada de 8h y cuál queda como horas extra (ver `CreateTicketHhRequestUseCase`). */
  sumRegularHoursForUserAndDate(userId: string, date: Date, context?: TransactionContext): Promise<number>;
}

export const HOUR_ENTRY_REPOSITORY = Symbol('HourEntryRepository');
