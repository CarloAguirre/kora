import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, roles, users, type Database } from '@kora/db';
import type {
  ProjectNotificationRecipient,
  ProjectUserReader,
  ProjectUserReference,
} from '../../application/ports/project-user-reader.port';
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

  async findActiveAdminTierRecipients(): Promise<ProjectNotificationRecipient[]> {
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(roles.isAdminTier, true), eq(users.status, 'active'), isNull(users.deletedAt)));
    return rows.map((row) => ({ id: row.id, fullName: `${row.firstName} ${row.lastName}`.trim(), email: row.email }));
  }
}
