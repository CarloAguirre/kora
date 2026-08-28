import { Inject, Injectable } from '@nestjs/common';
import { eq, users, type Database } from '@kora/db';
import type { TeamUserReader, TeamUserReference } from '../../application/ports/team-user-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleTeamUserReader implements TeamUserReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(userId: string): Promise<TeamUserReference | null> {
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    return row ? { id: row.id, fullName: `${row.firstName} ${row.lastName}`.trim() } : null;
  }
}
