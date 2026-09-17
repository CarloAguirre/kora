import { Inject, Injectable } from '@nestjs/common';
import { and, eq, hourEntries, sql, type Database } from '@kora/db';
import type { ProjectHourEntryReader } from '../../application/ports/project-hour-entry-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectHourEntryReader implements ProjectHourEntryReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async maxApprovedEntryDateForProject(projectId: string): Promise<Date | null> {
    const rows = await this.database
      .select({ maxDate: sql<string | null>`max(${hourEntries.date})` })
      .from(hourEntries)
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.status, 'approved')));

    const maxDate = rows[0]?.maxDate;
    return maxDate ? new Date(maxDate) : null;
  }
}
