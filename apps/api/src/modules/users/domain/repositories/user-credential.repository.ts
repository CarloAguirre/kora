import type { TransactionContext } from '@kora/core';
import type { PasswordAlgorithm } from '../../../../shared/application/ports/password-hasher.port';

/**
 * Puerto de credenciales, separado del de usuarios.
 *
 * Que sean dos puertos y no uno es deliberado (ISP): el listado de usuarios
 * depende solo de `UserRepository` y, por construcción, no puede leer un hash
 * de contraseña ni por error. Solo los casos de uso de autenticación dependen
 * de este puerto.
 */

export interface UserCredentialState {
  readonly userId: string;
  readonly passwordHash: string | null;
  readonly passwordAlgorithm: PasswordAlgorithm | null;
  readonly mustChangePassword: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly lastLoginAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly passwordUpdatedAt: Date | null;
}

export interface UpsertCredentialInput {
  readonly userId: string;
  readonly passwordHash: string | null;
  readonly passwordAlgorithm: PasswordAlgorithm | null;
  readonly mustChangePassword: boolean;
  readonly emailVerifiedAt?: Date | null;
}

export interface UserCredentialRepository {
  findByUserId(userId: string, context?: TransactionContext): Promise<UserCredentialState | null>;
  upsert(input: UpsertCredentialInput, context?: TransactionContext): Promise<void>;

  /** Actualiza solo el hash, sin tocar el estado de bloqueo. */
  updatePassword(
    userId: string,
    passwordHash: string,
    algorithm: PasswordAlgorithm,
    mustChangePassword: boolean,
    at: Date,
    context?: TransactionContext,
  ): Promise<void>;

  registerSuccessfulLogin(userId: string, at: Date, context?: TransactionContext): Promise<void>;

  /** Suma un intento fallido y devuelve el total acumulado. */
  registerFailedAttempt(userId: string, context?: TransactionContext): Promise<number>;

  lockUntil(userId: string, until: Date, context?: TransactionContext): Promise<void>;
  clearLock(userId: string, context?: TransactionContext): Promise<void>;

  /** Verdadero si el usuario tiene credencial con contraseña utilizable. */
  hasUsablePassword(userId: string, context?: TransactionContext): Promise<boolean>;
}

export const USER_CREDENTIAL_REPOSITORY = Symbol('UserCredentialRepository');
