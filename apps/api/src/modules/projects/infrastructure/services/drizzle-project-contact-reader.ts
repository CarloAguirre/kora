import { Inject, Injectable } from '@nestjs/common';
import { clientContacts, eq, type Database } from '@kora/db';
import type { ProjectContactReader, ProjectContactReference } from '../../application/ports/project-contact-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectContactReader implements ProjectContactReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(contactId: string): Promise<ProjectContactReference | null> {
    const rows = await this.database
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        position: clientContacts.position,
        email: clientContacts.email,
        phone: clientContacts.phone,
      })
      .from(clientContacts)
      .where(eq(clientContacts.id, contactId))
      .limit(1);
    return rows[0] ?? null;
  }
}
