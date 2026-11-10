import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@kora/core';
import type { CollaboratorProjectEvent } from '@kora/contracts';
import { PROJECT_HOUR_ENTRY_READER, type ProjectHourEntryReader } from '../ports/project-hour-entry-reader.port';

@Injectable()
export class CollaboratorProjectActivityService {
  constructor(
    @Inject(PROJECT_HOUR_ENTRY_READER) private readonly entries: ProjectHourEntryReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async weeklyHours(userId: string, projectIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (!projectIds.length) return new Map();
    const now = this.clock.now();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const rows = await this.entries.weeklyHoursByProjectForUser(userId, projectIds, monday, sunday);
    return new Map(rows.map((row) => [row.projectId, row.hours]));
  }

  async approvedEvents(projectId: string): Promise<{
    entries: CollaboratorProjectEvent[]; truncated: boolean;
  }> {
    const found = await this.entries.approvedProjectEvents(projectId, 500);
    return {
      truncated: found.truncated,
      entries: found.entries.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString().slice(0, 10),
        createdAt: entry.createdAt.toISOString(),
        userName: entry.userName,
        moduleName: entry.moduleName,
        activity: entry.activity,
        description: entry.description,
        hours: entry.hours,
        hasBlocker: entry.hasBlocker,
        blockerDescription: entry.blockerDescription,
      })),
    };
  }
}
