import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { Team } from '../entities/team.entity';

export interface TeamFilters {
  readonly search?: string | undefined;
  readonly isActive?: boolean | undefined;
  readonly includeDeleted?: boolean | undefined;
  readonly leaderUserId?: string | undefined;
}

export type TeamSortableField = 'name' | 'memberCount' | 'createdAt';

export interface TeamListItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly leaderUserId: string | null;
  readonly leaderName: string | null;
  readonly teamTypeId: string | null;
  readonly teamTypeName: string | null;
  readonly teamTypeColor: string | null;
  readonly teamTypeIcon: string | null;
  readonly memberCount: number;
  readonly createdAt: Date;
}

export interface TeamRepository {
  findById(id: string, context?: TransactionContext): Promise<Team | null>;
  findBySlug(slug: string, context?: TransactionContext): Promise<Team | null>;
  findByName(name: string, context?: TransactionContext): Promise<Team | null>;
  findByLegacyId(legacyId: number, context?: TransactionContext): Promise<Team | null>;

  search(
    filters: TeamFilters,
    page: PageRequest,
    sort: SortRequest<TeamSortableField>,
    context?: TransactionContext,
  ): Promise<Page<TeamListItem>>;

  save(team: Team, context?: TransactionContext): Promise<void>;

  nameIsTakenByAnother(
    name: string,
    excludingTeamId: string | null,
    context?: TransactionContext,
  ): Promise<boolean>;

  countActiveMembers(teamId: string, context?: TransactionContext): Promise<number>;

  /**
   * ¿Lidera `leaderUserId` algún equipo al que pertenece `memberUserId`?
   * "Lidera" incluye ser el líder oficial del equipo (`teams.leaderUserId`) o
   * liderar al menos un proyecto asignado a ese equipo (`project_teams.leaderUserId`,
   * migrado de `equipo_proyecto` en la v1) — la v1 permitía ambos casos.
   * Satisface la autoridad de aprobación de M4.
   */
  isTeamLeaderOfMember(leaderUserId: string, memberUserId: string, context?: TransactionContext): Promise<boolean>;

  /** Ids de usuarios con membresía activa en algún equipo liderado por `leaderUserId` (mismo criterio ampliado de "lidera"). */
  findMemberUserIdsForLeader(leaderUserId: string, context?: TransactionContext): Promise<string[]>;

  /**
   * ¿Es `userId` el líder oficial del equipo `teamId` (`teams.leaderUserId`)?
   * A diferencia de {@link isTeamLeaderOfMember}, NO se satisface con liderar
   * un proyecto puntual asignado al equipo — esta es la puerta de acceso a
   * "ver todos los proyectos del equipo", que debe quedar reservada al líder
   * de equipo real, no a cualquier líder de proyecto que pase por ahí.
   */
  isLeaderOfTeam(userId: string, teamId: string, context?: TransactionContext): Promise<boolean>;

  /**
   * ¿`userId` lidera el equipo `teamId` — mismo criterio ampliado que
   * {@link isTeamLeaderOfMember} (líder oficial del equipo o líder de al
   * menos un proyecto asignado a él), pero acotado a un equipo puntual en
   * vez de a los equipos de otro usuario. Usado para gatear Forecast
   * (`GET /teams?leaderUserId=me` ya usa este mismo criterio para decidir
   * qué equipos ve el líder — ver docs/DECISION-M6-FORECAST.md).
   */
  leadsTeam(userId: string, teamId: string, context?: TransactionContext): Promise<boolean>;

  /** Equipo activo de un usuario (el primero, si tuviera más de una membresía activa). */
  findActiveTeamForUser(
    userId: string,
    context?: TransactionContext,
  ): Promise<{ id: string; name: string } | null>;

  /**
   * Horas aprobadas y pendientes de aprobación por miembro activo del equipo y
   * día, dentro de un rango — alimenta el heatmap de "Horas pendientes de
   * aprobación". Solo días con horas > 0 aparecen.
   */
  getHoursByMemberAndDate(
    teamId: string,
    dateFrom: Date,
    dateTo: Date,
    context?: TransactionContext,
  ): Promise<Array<{ teamMemberId: string; date: string; approvedHours: number; pendingHours: number }>>;
}

export const TEAM_REPOSITORY = Symbol('TeamRepository');
