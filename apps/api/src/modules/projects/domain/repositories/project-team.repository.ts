import type { TransactionContext } from '@kora/core';

/**
 * Equipo asignado a un proyecto — el `equipo_proyecto` de la v1: un equipo,
 * su líder para este proyecto, cuántos colaboradores y cuántas horas se le
 * estiman. Distinto de `ProjectTeamMemberRepository`, que asigna PERSONAS
 * concretas (con horas y actividad propias) dentro de un equipo — ese es un
 * paso posterior en la ficha del proyecto, este es la asignación agregada
 * que ya se decide al crear el proyecto.
 */
export interface UpsertProjectTeamInput {
  readonly projectId: string;
  readonly teamId: string;
  readonly leaderUserId: string | null;
  readonly memberCount: number | null;
  readonly assignedHours: number | null;
}

export interface ProjectTeamRecord {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly leaderUserId: string | null;
  readonly leaderName: string | null;
  readonly assignedHours: number | null;
  /** Contado en vivo desde `project_team_members` — la v1 no traía este dato, así que el valor migrado siempre es nulo. */
  readonly memberCount: number;
  /** Tope de colaboradores definido en el formulario (`project_teams.member_count`); nulo = sin tope. */
  readonly maxMembers: number | null;
}

export interface ProjectTeamRepository {
  /** Crea o actualiza la fila de `(projectId, teamId)` — esa pareja es única. */
  save(input: UpsertProjectTeamInput, context?: TransactionContext): Promise<void>;
  findByProject(projectId: string, context?: TransactionContext): Promise<ProjectTeamRecord[]>;
  /** Quita el equipo del proyecto — usado cuando se destilda en la edición. */
  remove(projectId: string, teamId: string, context?: TransactionContext): Promise<void>;
  /**
   * ¿`actorUserId` es el líder de `teamId` en `projectId`? `coalesce(project_teams.leader_user_id,
   * teams.leader_user_id)` — el override del proyecto manda; si no hay override, el líder orgánico
   * del equipo. Variante por `teamId` (no por `memberUserId`) de `isProjectLeaderOrTeamLeaderOfMember`,
   * necesaria para asignar a alguien nuevo (todavía sin fila en `project_team_members`).
   */
  isTeamLeaderForProject(
    projectId: string,
    teamId: string,
    actorUserId: string,
    context?: TransactionContext,
  ): Promise<boolean>;
}

export const PROJECT_TEAM_REPOSITORY = Symbol('ProjectTeamRepository');
