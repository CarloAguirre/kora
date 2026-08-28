import { Inject, Injectable } from '@nestjs/common';
import { and, auditLog, desc, eq, sql, users, type Database } from '@kora/db';
import type { AuditReader, AuditReaderEntry, AuditReaderQuery } from '../../application/ports/audit-reader.port';
import { DATABASE } from '../database/database.module';

@Injectable()
export class DrizzleAuditReader implements AuditReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: AuditReaderQuery): Promise<AuditReaderEntry[]> {
    const conditions = [eq(auditLog.entityType, query.entityType)];
    for (const [key, value] of Object.entries(query.metadataEquals ?? {})) {
      conditions.push(sql`${auditLog.metadata} ->> ${key} = ${value}`);
    }

    const rows = await this.db
      .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        actorEmail: auditLog.actorEmail,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        changes: auditLog.changes,
        metadata: auditLog.metadata,
        occurredAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(and(...conditions))
      .orderBy(desc(auditLog.occurredAt))
      .limit(query.limit ?? 100);

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
      actorName: row.actorFirstName ? `${row.actorFirstName} ${row.actorLastName ?? ''}`.trim() : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      changes: row.changes ?? null,
      metadata: row.metadata ?? null,
      occurredAt: row.occurredAt,
    }));
  }
}
