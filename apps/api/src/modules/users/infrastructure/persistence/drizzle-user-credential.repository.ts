import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql, userCredentials, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  UpsertCredentialInput,
  UserCredentialRepository,
  UserCredentialState,
} from '../../domain/repositories/user-credential.repository';
import type { PasswordAlgorithm } from '../../../../shared/application/ports/password-hasher.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/** Persistencia del estado de acceso: contraseña, bloqueos e intentos fallidos. */
@Injectable()
export class DrizzleUserCredentialRepository implements UserCredentialRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findByUserId(
    userId: string,
    context?: TransactionContext,
  ): Promise<UserCredentialState | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      userId: row.userId,
      passwordHash: row.passwordHash,
      passwordAlgorithm: row.passwordAlgorithm as PasswordAlgorithm | null,
      mustChangePassword: row.mustChangePassword,
      failedAttempts: row.failedAttempts,
      lockedUntil: row.lockedUntil,
      lastLoginAt: row.lastLoginAt,
      emailVerifiedAt: row.emailVerifiedAt,
    };
  }

  async upsert(input: UpsertCredentialInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .insert(userCredentials)
      .values({
        userId: input.userId,
        passwordHash: input.passwordHash,
        passwordAlgorithm: input.passwordAlgorithm,
        mustChangePassword: input.mustChangePassword,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
      })
      .onConflictDoUpdate({
        target: userCredentials.userId,
        set: {
          passwordHash: input.passwordHash,
          passwordAlgorithm: input.passwordAlgorithm,
          mustChangePassword: input.mustChangePassword,
          updatedAt: sql`now()`,
        },
      });
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    algorithm: PasswordAlgorithm,
    mustChangePassword: boolean,
    at: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(userCredentials)
      .set({
        passwordHash,
        passwordAlgorithm: algorithm,
        passwordUpdatedAt: at,
        mustChangePassword,
        // Fijar una contraseña nueva limpia el bloqueo: si la persona demostró
        // ser quien dice a través del enlace de recuperación, retener el
        // bloqueo solo la dejaría fuera sin motivo.
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: at,
      })
      .where(eq(userCredentials.userId, userId));
  }

  async registerSuccessfulLogin(
    userId: string,
    at: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(userCredentials)
      .set({ lastLoginAt: at, failedAttempts: 0, lockedUntil: null, updatedAt: at })
      .where(eq(userCredentials.userId, userId));
  }

  async registerFailedAttempt(userId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);

    // El incremento se hace en la base (`failed_attempts + 1`) y no leyendo y
    // escribiendo desde la aplicación: dos intentos simultáneos contarían como
    // uno solo si se hiciera lo segundo.
    const rows = await db
      .update(userCredentials)
      .set({
        failedAttempts: sql`${userCredentials.failedAttempts} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(userCredentials.userId, userId))
      .returning({ failedAttempts: userCredentials.failedAttempts });

    return rows[0]?.failedAttempts ?? 0;
  }

  async lockUntil(userId: string, until: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(userCredentials)
      .set({ lockedUntil: until, updatedAt: sql`now()` })
      .where(eq(userCredentials.userId, userId));
  }

  async clearLock(userId: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(userCredentials)
      .set({ lockedUntil: null, failedAttempts: 0, updatedAt: sql`now()` })
      .where(eq(userCredentials.userId, userId));
  }

  async hasUsablePassword(userId: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({ userId: userCredentials.userId })
      .from(userCredentials)
      .where(and(eq(userCredentials.userId, userId), isNotNull(userCredentials.passwordHash)))
      .limit(1);

    return rows.length > 0;
  }
}
