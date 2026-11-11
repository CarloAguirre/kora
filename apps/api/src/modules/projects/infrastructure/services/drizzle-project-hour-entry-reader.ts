import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, hourEntries, inArray, lt, lte, projectModules, sql, users, type Database } from '@kora/db';
import type { ProjectHourEntryReader } from '../../application/ports/project-hour-entry-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectHourEntryReader implements ProjectHourEntryReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async weeklyHoursByProjectForUser(
    userId: string, projectIds: readonly string[], from: Date, through: Date,
  ): Promise<readonly { projectId: string; hours: number }[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.database
      .select({ projectId: hourEntries.projectId, hours: sql<string>`coalesce(sum(${hourEntries.hours}), 0)` })
      .from(hourEntries)
      .where(and(
        eq(hourEntries.userId, userId),
        inArray(hourEntries.projectId, [...projectIds]),
        inArray(hourEntries.status, ['approved', 'pending']),
        gte(hourEntries.date, from), lte(hourEntries.date, through),
      ))
      .groupBy(hourEntries.projectId);
    return rows.flatMap((row) => row.projectId ? [{ projectId: row.projectId, hours: Number(row.hours) }] : []);
  }

  async approvedProjectEvents(projectId: string, limit: number) {
    const rows = await this.database
      .select({
        id: hourEntries.id, date: hourEntries.date, createdAt: hourEntries.createdAt,
        firstName: users.firstName, lastName: users.lastName,
        moduleName: projectModules.name, activity: hourEntries.category,
        description: hourEntries.description, hours: hourEntries.hours,
        hasBlocker: hourEntries.hasBlocker, blockerDescription: hourEntries.blockerDescription,
      })
      .from(hourEntries)
      .leftJoin(users, eq(users.id, hourEntries.userId))
      .leftJoin(projectModules, eq(projectModules.id, hourEntries.moduleId))
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.status, 'approved')))
      .orderBy(desc(hourEntries.date), desc(hourEntries.createdAt))
      .limit(limit + 1);
    return {
      truncated: rows.length > limit,
      entries: rows.slice(0, limit).map((row) => ({
        id: row.id, date: row.date, createdAt: row.createdAt,
        userName: [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Colaborador',
        moduleName: row.moduleName, activity: row.activity, description: row.description,
        hours: Number(row.hours), hasBlocker: row.hasBlocker, blockerDescription: row.blockerDescription,
      })),
    };
  }

  async maxApprovedEntryDateForProject(projectId: string): Promise<Date | null> {
    const rows = await this.database
      .select({ maxDate: sql<string | null>`max(${hourEntries.date})` })
      .from(hourEntries)
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.status, 'approved')));

    const maxDate = rows[0]?.maxDate;
    return maxDate ? new Date(maxDate) : null;
  }

  async sumApprovedHoursBeforeDateForProject(projectId: string, beforeDate: Date): Promise<number> {
    const rows = await this.database
      .select({ total: sql<string>`coalesce(sum(${hourEntries.hours}), 0)` })
      .from(hourEntries)
      .where(and(eq(hourEntries.projectId, projectId), eq(hourEntries.status, 'approved'), lt(hourEntries.date, beforeDate)));

    return Number(rows[0]?.total ?? 0);
  }
}
