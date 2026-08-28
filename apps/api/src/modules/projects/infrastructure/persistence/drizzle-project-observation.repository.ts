import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, projectObservations, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ProjectObservationRecord,
  ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleProjectObservationRepository implements ProjectObservationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(
    projectId: string,
    context?: TransactionContext,
  ): Promise<ProjectObservationRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        id: projectObservations.id,
        projectId: projectObservations.projectId,
        message: projectObservations.message,
        authorUserId: projectObservations.authorUserId,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        createdAt: projectObservations.createdAt,
      })
      .from(projectObservations)
      .innerJoin(users, eq(users.id, projectObservations.authorUserId))
      .where(eq(projectObservations.projectId, projectId))
      .orderBy(asc(projectObservations.createdAt));

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      message: row.message,
      authorUserId: row.authorUserId,
      authorName: `${row.authorFirstName} ${row.authorLastName}`.trim(),
      createdAt: row.createdAt,
    }));
  }

  async add(
    projectId: string,
    message: string,
    authorUserId: string,
    now: Date,
    context?: TransactionContext,
  ): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectObservations)
      .values({ projectId, message, authorUserId, createdAt: now })
      .returning({ id: projectObservations.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La observación no devolvió identificador.');
    return id;
  }
}
