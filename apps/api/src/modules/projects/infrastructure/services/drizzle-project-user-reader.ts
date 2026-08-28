import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, users, type Database } from '@kora/db';
import type { ProjectUserReader, ProjectUserReference } from '../../application/ports/project-user-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectUserReader implements ProjectUserReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(userId: string): Promise<ProjectUserReference | null> {
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    return row ? { id: row.id, fullName: `${row.firstName} ${row.lastName}`.trim() } : null;
  }

  async findManyByIds(userIds: readonly string[]): Promise<ProjectUserReference[]> {
    if (userIds.length === 0) return [];
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    return rows.map((row) => ({ id: row.id, fullName: `${row.firstName} ${row.lastName}`.trim() }));
  }
}
