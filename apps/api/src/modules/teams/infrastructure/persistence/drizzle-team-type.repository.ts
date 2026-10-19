import { Inject, Injectable } from '@nestjs/common';
import { and, asc, sql, teamTypes, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateTeamTypeData,
  TeamTypeRecord,
  TeamTypeRepository,
  UpdateTeamTypeData,
} from '../../domain/repositories/team-type.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleTeamTypeRepository implements TeamTypeRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(context?: TransactionContext): Promise<TeamTypeRecord[]> {
    const db = resolveDb(this.database, context);
    return db.select().from(teamTypes).orderBy(asc(teamTypes.name));
  }

  async findById(id: string, context?: TransactionContext): Promise<TeamTypeRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(teamTypes).where(sql`${teamTypes.id} = ${id}`).limit(1);
    return rows[0] ?? null;
  }

  async nameIsTaken(name: string, excludeId?: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teamTypes.id })
      .from(teamTypes)
      .where(
        and(
          sql`lower(btrim(${teamTypes.name})) = lower(btrim(${name}))`,
          excludeId ? sql`${teamTypes.id} <> ${excludeId}` : undefined,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async create(data: CreateTeamTypeData, context?: TransactionContext): Promise<TeamTypeRecord> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .insert(teamTypes)
      .values({
        id: data.id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        createdAt: data.now,
        updatedAt: data.now,
      })
      .returning();
    return rows[0]!;
  }

  async update(id: string, data: UpdateTeamTypeData, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db
      .update(teamTypes)
      .set({ name: data.name, color: data.color, icon: data.icon, updatedAt: data.now })
      .where(sql`${teamTypes.id} = ${id}`);
  }

  async delete(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(teamTypes).where(sql`${teamTypes.id} = ${id}`);
  }
}
