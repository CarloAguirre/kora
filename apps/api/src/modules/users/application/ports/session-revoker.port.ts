import type { TransactionContext } from '@kora/core';

/**
 * Revocación de sesiones vista desde el módulo de usuarios.
 *
 * El módulo de usuarios necesita poder echar a alguien del sistema, pero no
 * necesita —ni debe— conocer cómo se emiten los tokens. Declara este puerto
 * mínimo y el módulo de autenticación lo satisface; la dependencia va de
 * usuarios hacia una abstracción, nunca hacia la implementación.
 */

export type SessionRevokeReason =
  | 'logout'
  | 'rotated'
  | 'password_changed'
  | 'status_changed'
  | 'admin_revoked'
  | 'expired';

export interface SessionRevoker {
  revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
    context?: TransactionContext,
  ): Promise<void>;

  revokeById(
    sessionId: string,
    reason: SessionRevokeReason,
    at: Date,
    context?: TransactionContext,
  ): Promise<void>;
}

export const SESSION_REVOKER = Symbol('SessionRevoker');
