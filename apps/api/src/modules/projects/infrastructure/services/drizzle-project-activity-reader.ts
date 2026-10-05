import { Inject, Injectable } from '@nestjs/common';
import { and, auditLog, eq, projectObservations, sql, type Database } from '@kora/db';
import type { ProjectActivityReader } from '../../application/ports/project-activity-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectActivityReader implements ProjectActivityReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async lastActivityAtByUser(projectId: string, userId: string): Promise<Date | null> {
    const [auditRows, observationRows] = await Promise.all([
      this.database
        .select({ lastAt: sql<string | null>`max(${auditLog.occurredAt})` })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'project'), eq(auditLog.entityId, projectId), eq(auditLog.actorUserId, userId))),
      /** `updatedAt` y no `createdAt`: editar o resolver una entrada también es actividad. */
      this.database
        .select({ lastAt: sql<string | null>`max(${projectObservations.updatedAt})` })
        .from(projectObservations)
        .where(and(eq(projectObservations.projectId, projectId), eq(projectObservations.authorUserId, userId))),
    ]);

    const candidates = [auditRows[0]?.lastAt, observationRows[0]?.lastAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value));
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates.map((date) => date.getTime())));
  }
}
