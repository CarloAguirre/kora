import type { TransactionContext } from '@kora/core';
import type { SessionRevoker } from '../../../users/application/ports/session-revoker.port';

/**
 * Persistencia de sesiones (refresh tokens).
 *
 * Extiende `SessionRevoker`, el puerto reducido que declara el módulo de
 * usuarios: la implementación es una sola, pero cada módulo depende solo de la
 * parte que usa. Usuarios puede revocar; solo autenticación puede emitir.
 */

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly rotatedFromId?: string | null;
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export interface SessionRepository extends SessionRevoker {
  create(input: CreateSessionInput, context?: TransactionContext): Promise<void>;
  findByRefreshTokenHash(hash: string, context?: TransactionContext): Promise<SessionRecord | null>;
  findById(sessionId: string, context?: TransactionContext): Promise<SessionRecord | null>;
  touch(sessionId: string, at: Date, context?: TransactionContext): Promise<void>;
  listActiveForUser(userId: string, at: Date): Promise<SessionRecord[]>;

  /** Borra sesiones caducadas hace tiempo. Lo llama una tarea de mantenimiento. */
  purgeExpired(before: Date): Promise<number>;
}

export const SESSION_REPOSITORY = Symbol('SessionRepository');
