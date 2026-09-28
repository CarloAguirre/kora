import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, projectModules, projectObservations, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  AddProjectObservationData,
  ProjectObservationRecord,
  ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

const SELECTION = {
  id: projectObservations.id,
  projectId: projectObservations.projectId,
  type: projectObservations.type,
  title: projectObservations.title,
  message: projectObservations.message,
  status: projectObservations.status,
  moduleId: projectObservations.moduleId,
  moduleName: projectModules.name,
  date: projectObservations.date,
  isHito0: projectObservations.isHito0,
  authorUserId: projectObservations.authorUserId,
  authorFirstName: users.firstName,
  authorLastName: users.lastName,
  createdAt: projectObservations.createdAt,
};

function toRecord(row: {
  id: string;
  projectId: string;
  type: ProjectObservationRecord['type'];
  title: string | null;
  message: string;
  status: ProjectObservationRecord['status'];
  moduleId: string | null;
  moduleName: string | null;
  date: Date;
  isHito0: boolean;
  authorUserId: string;
  authorFirstName: string;
  authorLastName: string;
  createdAt: Date;
}): ProjectObservationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    message: row.message,
    status: row.status,
    moduleId: row.moduleId,
    moduleName: row.moduleName,
    date: row.date,
    isHito0: row.isHito0,
    authorUserId: row.authorUserId,
    authorName: `${row.authorFirstName} ${row.authorLastName}`.trim(),
    createdAt: row.createdAt,
  };
}

@Injectable()
export class DrizzleProjectObservationRepository implements ProjectObservationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(
    projectId: string,
    context?: TransactionContext,
  ): Promise<ProjectObservationRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(SELECTION)
      .from(projectObservations)
      .innerJoin(users, eq(users.id, projectObservations.authorUserId))
      .leftJoin(projectModules, eq(projectModules.id, projectObservations.moduleId))
      .where(eq(projectObservations.projectId, projectId))
      .orderBy(asc(projectObservations.createdAt));

    return rows.map(toRecord);
  }

  async findById(id: string, context?: TransactionContext): Promise<ProjectObservationRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(SELECTION)
      .from(projectObservations)
      .innerJoin(users, eq(users.id, projectObservations.authorUserId))
      .leftJoin(projectModules, eq(projectModules.id, projectObservations.moduleId))
      .where(eq(projectObservations.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async add(data: AddProjectObservationData, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectObservations)
      .values({
        projectId: data.projectId,
        type: data.type,
        title: data.title,
        message: data.message,
        status: data.status,
        moduleId: data.moduleId,
        date: data.date,
        isHito0: data.isHito0 ?? false,
        authorUserId: data.authorUserId,
        createdAt: data.now,
      })
      .returning({ id: projectObservations.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La observación no devolvió identificador.');
    return id;
  }

  async update(id: string, message: string, now: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectObservations)
      .set({ message, updatedAt: now })
      .where(eq(projectObservations.id, id));
  }

  async updateStatus(
    id: string,
    status: ProjectObservationRecord['status'],
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectObservations)
      .set({ status, updatedAt: now })
      .where(eq(projectObservations.id, id));
  }

  async updateHito0Date(projectId: string, date: Date, now: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectObservations)
      .set({ date, updatedAt: now })
      .where(and(eq(projectObservations.projectId, projectId), eq(projectObservations.isHito0, true)));
  }

  async remove(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db.delete(projectObservations).where(eq(projectObservations.id, id));
  }
}
