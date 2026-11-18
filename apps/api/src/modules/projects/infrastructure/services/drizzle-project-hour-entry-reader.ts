import { Inject, Injectable } from '@nestjs/common';
import { and, or, asc, desc, eq, gte, hourEntries, inArray, lt, lte, projectModuleSegments, projectModuleTasks, projectModules, projectQuotations, quotationEvents, quotationVersions, sql, users, type Database } from '@kora/db';
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

  async projectBitacoraEvents(projectId: string, limit: number) {
    const rows = await this.database
      .select({
        id: hourEntries.id, date: hourEntries.date, createdAt: hourEntries.createdAt,
        firstName: users.firstName, lastName: users.lastName,
        moduleName: projectModules.name, activity: hourEntries.category,
        description: hourEntries.description, hours: hourEntries.hours,
        hasBlocker: hourEntries.hasBlocker, blockerDescription: hourEntries.blockerDescription,
        status: hourEntries.status,
      })
      .from(hourEntries)
      .leftJoin(users, eq(users.id, hourEntries.userId))
      .leftJoin(projectModules, eq(projectModules.id, hourEntries.moduleId))
      // Incidentes pendientes deben mostrarse desde que se registran.
      // El evento pasa a aprobado sin generar otra fila en la bitácora.
      .where(and(eq(hourEntries.projectId, projectId),
        or(eq(hourEntries.status, 'approved'),
          and(eq(hourEntries.status, 'pending'), eq(hourEntries.hasBlocker, true)))))
      .orderBy(desc(hourEntries.createdAt), desc(hourEntries.date))
      .limit(limit + 1);
    return {
      truncated: rows.length > limit,
      entries: rows.slice(0, limit).map((row) => ({
        id: row.id, date: row.date, createdAt: row.createdAt,
        userName: [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Colaborador',
        moduleName: row.moduleName, activity: row.activity, description: row.description,
        hours: Number(row.hours), hasBlocker: row.hasBlocker, blockerDescription: row.blockerDescription,
        status: row.status as 'approved' | 'pending',
      })),
    };
  }

  async phaseZeroSnapshotForProject(projectId: string): Promise<{
    transferred: boolean; hours: number | null; cutoffAt: Date | null;
  }> {
    const [event] = await this.database.select({ metadata: quotationEvents.metadata, transferredAt: quotationEvents.occurredAt })
      .from(quotationEvents)
      .innerJoin(quotationVersions, eq(quotationVersions.id, quotationEvents.versionId))
      .innerJoin(projectQuotations, eq(projectQuotations.id, quotationVersions.quotationId))
      .where(and(eq(projectQuotations.projectId, projectId),
        eq(quotationEvents.action, 'quotation_transferred')))
      .orderBy(asc(quotationEvents.occurredAt))
      .limit(1);
    if (!event) return { transferred: false, hours: null, cutoffAt: null };

    // 053af371 ya guarda el usedHours previo en este evento append-only.
    const prior = event.metadata.priorCommercialState;
    const hours = prior && typeof prior === 'object' && 'usedHours' in prior
      ? prior.usedHours : null;
    return {
      transferred: true,
      cutoffAt: event.transferredAt,
      hours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0
        ? hours : null,
    };
  }

  /** Los registros de Fase 0 se delimitan por fecha de creación, no por
   * date (una hora histórica puede registrarse retroactivamente).
   * Las imputaciones posteriores al traspaso no pertenecen a Fase 0.
   * teamId se toma SOLO de un bloque o tarea vinculados explícitamente.
   */
  async phaseZeroEntriesForProject(projectId: string, cutoffAt: Date | null, limit: number) {
    const rows = await this.database.select({
      id: hourEntries.id, userId: hourEntries.userId,
      date: hourEntries.date, createdAt: hourEntries.createdAt,
      status: hourEntries.status, hours: hourEntries.hours,
      activity: hourEntries.category, description: hourEntries.description,
      firstName: users.firstName, lastName: users.lastName,
      taskName: projectModuleTasks.name,
      segmentTeamId: projectModuleSegments.teamId,
      taskTeamId: projectModuleTasks.teamId,
    }).from(hourEntries)
      .leftJoin(users, eq(users.id, hourEntries.userId))
      .leftJoin(projectModuleSegments, eq(projectModuleSegments.id, hourEntries.segmentId))
      .leftJoin(projectModuleTasks, eq(projectModuleTasks.id, hourEntries.taskId))
      .where(and(eq(hourEntries.projectId, projectId),
        cutoffAt ? lte(hourEntries.createdAt, cutoffAt) : undefined))
      .orderBy(desc(hourEntries.date), desc(hourEntries.createdAt))
      .limit(limit + 1);
    return {
      truncated: rows.length > limit,
      entries: rows.slice(0, limit).map((row) => ({
        id: row.id, userId: row.userId,
        userName: [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Colaborador',
        date: row.date, createdAt: row.createdAt, status: row.status,
        hours: Number(row.hours), activity: row.activity, description: row.description,
        taskName: row.taskName,
        teamId: row.segmentTeamId ?? row.taskTeamId ?? null,
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
