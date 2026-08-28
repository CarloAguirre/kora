import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt, sessions, sql, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateSessionInput,
  SessionRecord,
  SessionRepository,
} from '../../application/ports/session.repository';
import type { SessionRevokeReason } from '../../../users/application/ports/session-revoker.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/** Persistencia de sesiones sobre la tabla `sessions`. */
@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(input: CreateSessionInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db.insert(sessions).values({
      id: input.id,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      rotatedFromId: input.rotatedFromId ?? null,
    });
  }

  async findByRefreshTokenHash(
    hash: string,
    context?: TransactionContext,
  ): Promise<SessionRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(this.columns())
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);

    return rows[0] ?? null;
  }

  async findById(sessionId: string, context?: TransactionContext): Promise<SessionRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(this.columns())
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    return rows[0] ?? null;
  }

  async touch(sessionId: string, at: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db.update(sessions).set({ lastUsedAt: at }).where(eq(sessions.id, sessionId));
  }

  async listActiveForUser(userId: string, at: Date): Promise<SessionRecord[]> {
    return this.database
      .select(this.columns())
      .from(sessions)
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, at)),
      )
      .orderBy(sql`${sessions.createdAt} desc`);
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    // Solo se tocan las que siguen vivas: así una sesión revocada por rotación
    // conserva su motivo original, que es lo que permite detectar la
    // reutilización de un token robado.
    await db
      .update(sessions)
      .set({ revokedAt: at, revokedReason: reason, updatedAt: at })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async revokeById(
    sessionId: string,
    reason: SessionRevokeReason,
    at: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(sessions)
      .set({ revokedAt: at, revokedReason: reason, updatedAt: at })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  async purgeExpired(before: Date): Promise<number> {
    const rows = await this.database
      .delete(sessions)
      .where(lt(sessions.expiresAt, before))
      .returning({ id: sessions.id });

    return rows.length;
  }

  private columns() {
    return {
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      revokedReason: sessions.revokedReason,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
    };
  }
}
