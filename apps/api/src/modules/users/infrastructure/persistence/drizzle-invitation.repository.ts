import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, passwordResetTokens, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepository,
} from '../../application/ports/invitation.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/**
 * Invitaciones y recuperaciones de contraseña sobre `password_reset_tokens`.
 *
 * Comparten tabla porque son el mismo objeto: un token de un solo uso que
 * autoriza a fijar una contraseña. Lo único que cambia es el correo que lo
 * acompaña.
 */
@Injectable()
export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(input: CreateInvitationInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db.insert(passwordResetTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      requestedIp: input.requestedIp,
    });
  }

  async findByTokenHash(
    tokenHash: string,
    context?: TransactionContext,
  ): Promise<InvitationRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    return rows[0] ?? null;
  }

  async markAsUsed(id: string, at: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(passwordResetTokens)
      .set({ usedAt: at, updatedAt: at })
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt)));
  }

  async invalidateAllForUser(
    userId: string,
    at: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    // Marcarlos como usados los invalida sin borrar la traza de que existieron.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: at, updatedAt: at })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  }
}
