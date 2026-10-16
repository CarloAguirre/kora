import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { scheduledJobRuns, type Database } from '@kora/db';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';
import type { ScheduledJobRunRegistry } from '../application/ports/scheduled-job-run-registry.port';

@Injectable()
export class DrizzleScheduledJobRunRegistry implements ScheduledJobRunRegistry {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async tryStart(jobName: string, runDate: string): Promise<boolean> {
    // La clave primaria (job_name, run_date) hace atómico el "¿ya corrió hoy?".
    const inserted = await this.db
      .insert(scheduledJobRuns)
      .values({ jobName, runDate })
      .onConflictDoNothing()
      .returning({ jobName: scheduledJobRuns.jobName });
    return inserted.length > 0;
  }

  async finish(jobName: string, runDate: string, summary: Record<string, unknown>): Promise<void> {
    await this.db
      .update(scheduledJobRuns)
      .set({ finishedAt: new Date(), summary })
      .where(and(eq(scheduledJobRuns.jobName, jobName), eq(scheduledJobRuns.runDate, runDate)));
  }
}
