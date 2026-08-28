import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, users, type Database } from '@kora/db';
import type {
  CommercialManagerReader,
  CommercialManagerReference,
} from '../../application/ports/commercial-manager-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleCommercialManagerReader implements CommercialManagerReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(userId: string): Promise<CommercialManagerReference | null> {
    const rows = await this.database
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        isCommercialManager: users.isCommercialManager,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    return row ? this.toReference(row) : null;
  }

  async findManyByIds(userIds: readonly string[]): Promise<CommercialManagerReference[]> {
    if (userIds.length === 0) return [];

    const rows = await this.database
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        isCommercialManager: users.isCommercialManager,
      })
      .from(users)
      .where(inArray(users.id, [...userIds]));

    return rows.map((row) => this.toReference(row));
  }

  private toReference(row: {
    id: string;
    firstName: string;
    lastName: string;
    isCommercialManager: boolean;
  }): CommercialManagerReference {
    return {
      id: row.id,
      fullName: `${row.firstName} ${row.lastName}`.trim(),
      isCommercialManager: row.isCommercialManager,
    };
  }
}
