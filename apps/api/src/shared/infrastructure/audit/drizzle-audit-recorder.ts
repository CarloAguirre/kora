import { Inject, Injectable } from '@nestjs/common';
import { auditLog, type Database } from '@kora/db';
import { LOGGER, type Logger } from '@kora/core';
import type { AuditEntry, AuditRecorder } from '../../application/ports/audit-recorder.port';
import { DATABASE } from '../database/database.module';

/**
 * Persiste la auditoría en `audit_log`.
 *
 * Un fallo al auditar NUNCA tumba la operación de negocio: si la escritura de
 * la bitácora falla, se registra el problema en el log y la operación sigue.
 * Perder una línea de auditoría es malo; perder el alta de un usuario porque la
 * auditoría falló es peor.
 */
@Injectable()
export class DrizzleAuditRecorder implements AuditRecorder {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLog).values({
        actorUserId: entry.actor.userId,
        actorEmail: entry.actor.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: entry.changes ?? null,
        metadata: entry.metadata ?? null,
        ipAddress: entry.actor.ipAddress ?? null,
        userAgent: entry.actor.userAgent ?? null,
        requestId: entry.actor.requestId ?? null,
      });
    } catch (error) {
      this.logger.error('No se pudo registrar la auditoría', {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Calcula el diff entre dos instantáneas, quedándose solo con lo que cambió.
 * Guardar el objeto completo antes y después inflaría la tabla y haría ilegible
 * el historial.
 */
export function diffSnapshots<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  for (const [key, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) continue;
    const previousValue = before[key];
    if (!Object.is(previousValue, nextValue)) {
      changes[key] = { before: previousValue ?? null, after: nextValue ?? null };
    }
  }

  return changes;
}
