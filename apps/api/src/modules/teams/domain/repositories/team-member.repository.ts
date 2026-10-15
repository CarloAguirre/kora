import type { TransactionContext } from '@kora/core';
import type { UserStatus } from '@kora/contracts';

export interface TeamMemberRecord {
  readonly id: string;
  readonly teamId: string;
  readonly userId: string;
  /** Resuelto por join en infraestructura: evita un puerto aparte solo para nombres. */
  readonly userFullName: string;
  readonly userEmail: string;
  readonly userStatus: UserStatus;
  readonly position: string | null;
  readonly weeklyHours: number;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

export interface AddTeamMemberRecord {
  readonly teamId: string;
  readonly userId: string;
  readonly position: string | null;
  readonly weeklyHours: number;
  readonly joinedAt: Date;
}

export interface TeamMemberRecordWithTeam extends TeamMemberRecord {
  readonly teamName: string;
}

export interface TeamMemberRepository {
  listActiveForTeam(teamId: string, context?: TransactionContext): Promise<TeamMemberRecord[]>;
  /** Todos los miembros activos de todos los equipos, con el nombre de su equipo — usado por el forecast (M6). */
  listAllActive(context?: TransactionContext): Promise<TeamMemberRecordWithTeam[]>;
  findActiveById(id: string, context?: TransactionContext): Promise<TeamMemberRecord | null>;
  findActiveByUserAndTeam(
    userId: string,
    teamId: string,
    context?: TransactionContext,
  ): Promise<TeamMemberRecord | null>;

  add(record: AddTeamMemberRecord, context?: TransactionContext): Promise<string>;
  updateDetails(
    id: string,
    data: { position?: string | null; weeklyHours?: number },
    context?: TransactionContext,
  ): Promise<void>;

  /** Marca la salida (`left_at`); no borra la fila, para conservar el histórico. */
  remove(id: string, at: Date, context?: TransactionContext): Promise<void>;
}

export const TEAM_MEMBER_REPOSITORY = Symbol('TeamMemberRepository');
