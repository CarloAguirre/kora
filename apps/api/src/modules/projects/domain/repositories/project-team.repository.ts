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
}

export interface ProjectTeamRepository {
  /** Crea o actualiza la fila de `(projectId, teamId)` — esa pareja es única. */
  save(input: UpsertProjectTeamInput, context?: TransactionContext): Promise<void>;
  findByProject(projectId: string, context?: TransactionContext): Promise<ProjectTeamRecord[]>;
}

export const PROJECT_TEAM_REPOSITORY = Symbol('ProjectTeamRepository');
