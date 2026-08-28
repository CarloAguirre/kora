import type { TransactionContext } from '@kora/core';

/**
 * Invitaciones y recuperaciones de contraseña.
 *
 * Ambas son lo mismo desde el punto de vista técnico —un token de un solo uso
 * que autoriza a fijar una contraseña— así que comparten tabla y puerto. Solo
 * se guarda el hash del token: el valor en claro existe únicamente en el enlace
 * que recibe la persona.
 */

export interface CreateInvitationInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly requestedIp: string | null;
}

export interface InvitationRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export interface InvitationRepository {
  create(input: CreateInvitationInput, context?: TransactionContext): Promise<void>;

  /** Busca por hash. Devuelve el registro aunque esté usado o expirado, para
   *  que el caso de uso distinga "no existe" de "ya se usó". */
  findByTokenHash(tokenHash: string, context?: TransactionContext): Promise<InvitationRecord | null>;

  markAsUsed(id: string, at: Date, context?: TransactionContext): Promise<void>;

  /** Invalida los tokens vigentes de un usuario antes de emitir uno nuevo. */
  invalidateAllForUser(userId: string, at: Date, context?: TransactionContext): Promise<void>;
}

export const INVITATION_REPOSITORY = Symbol('InvitationRepository');
