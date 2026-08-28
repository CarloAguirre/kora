import { Inject, Injectable } from '@nestjs/common';
import { clients, eq, type Database } from '@kora/db';
import type { ProjectClientReader, ProjectClientReference } from '../../application/ports/project-client-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectClientReader implements ProjectClientReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(clientId: string): Promise<ProjectClientReference | null> {
    const rows = await this.database
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    return rows[0] ?? null;
  }
}
