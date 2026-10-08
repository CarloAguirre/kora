import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  forecastAssignments,
  gt,
  gte,
  hourEntries,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  projectModuleDeliveries,
  projectModuleSegmentMembers,
  projectModuleSegments,
  projectModuleTasks,
  projectModules,
  projectTeamMembers,
  projects,
  sql,
  sum,
  teamMembers,
  type Database,
} from '@kora/db';
import type {
  ForecastContainedTaskSignal,
  ForecastDeliverySignal,
  ForecastLoggedHoursSignal,
  ForecastPlanningSignalsReader,
  ForecastProjectHoursSignal,
} from '../../application/ports/forecast-planning-signals-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

const LIVE_PROJECT_STATUSES = ['draft', 'active', 'on_hold'] as const;

/**
 * Lee tablas de proyectos y horas directamente, igual que `DrizzleForecastHolidayReader`: son
 * lecturas de solo consulta para la pantalla, y pasar por `ProjectsModule` obligaría a exponer
 * repositorios que solo existen para esto.
 */
@Injectable()
export class DrizzleForecastPlanningSignalsReader implements ForecastPlanningSignalsReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listDeliveries(start: Date, end: Date): Promise<ForecastDeliverySignal[]> {
    const rows = await this.db
      .select({
        id: projectModuleDeliveries.id,
        name: projectModuleDeliveries.name,
        projectName: projects.name,
        moduleName: projectModules.name,
        date: projectModuleDeliveries.estimatedDate,
        assigneeUserId: projectModuleDeliveries.assigneeUserId,
        teamId: projectModuleDeliveries.teamId,
      })
      .from(projectModuleDeliveries)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          isNotNull(projectModuleDeliveries.assigneeUserId),
          gte(projectModuleDeliveries.estimatedDate, start),
          lte(projectModuleDeliveries.estimatedDate, end),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? row.moduleName,
      projectName: row.projectName,
      moduleName: row.moduleName,
      date: row.date,
      assigneeUserId: row.assigneeUserId!,
      teamId: row.teamId,
    }));
  }

  async listContainedTasks(start: Date, end: Date): Promise<ForecastContainedTaskSignal[]> {
    const rows = await this.db
      .select({
        id: projectModuleTasks.id,
        name: projectModuleTasks.name,
        projectName: projects.name,
        moduleName: projectModules.name,
        startDate: projectModuleTasks.startDate,
        date: projectModuleTasks.date,
        estimatedHours: projectModuleTasks.estimatedHours,
        teamMemberId: projectModuleSegmentMembers.teamMemberId,
      })
      .from(projectModuleTasks)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .innerJoin(projectModuleSegments, eq(projectModuleSegments.moduleId, projectModuleTasks.moduleId))
      .innerJoin(projectModuleSegmentMembers, eq(projectModuleSegmentMembers.segmentId, projectModuleSegments.id))
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.id, projectModuleSegmentMembers.teamMemberId),
          eq(teamMembers.userId, projectModuleTasks.assigneeUserId),
        ),
      )
      .where(
        and(
          isNull(projects.deletedAt),
          gt(projectModuleTasks.estimatedHours, '0'),
          gt(projectModuleSegmentMembers.dailyPercent, '0'),
          lte(projectModuleTasks.startDate, end),
          gte(projectModuleTasks.date, start),
          // El tramo se cruza con la parte de la tarea que cae en el período.
          sql`${projectModuleSegments.startDate} <= least(${projectModuleTasks.date}, ${toIsoDate(end)}::date)`,
          sql`${projectModuleSegments.endDate} >= greatest(${projectModuleTasks.startDate}, ${toIsoDate(start)}::date)`,
        ),
      );

    const unique = new Map<string, ForecastContainedTaskSignal>();
    for (const row of rows) {
      unique.set(`${row.id}|${row.teamMemberId}`, {
        id: row.id,
        name: row.name,
        projectName: row.projectName,
        moduleName: row.moduleName,
        startDate: row.startDate,
        date: row.date,
        estimatedHours: Number(row.estimatedHours ?? 0),
        teamMemberId: row.teamMemberId,
      });
    }
    return [...unique.values()];
  }

  async listAssignedProjectHours(): Promise<ForecastProjectHoursSignal[]> {
    const rows = await this.db
      .select({
        teamMemberId: projectTeamMembers.teamMemberId,
        projectId: projects.id,
        projectName: projects.name,
        hours: sum(projectTeamMembers.assignedHours),
      })
      .from(projectTeamMembers)
      .innerJoin(projects, eq(projects.id, projectTeamMembers.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          inArray(projects.status, [...LIVE_PROJECT_STATUSES]),
          gt(projectTeamMembers.assignedHours, '0'),
        ),
      )
      .groupBy(projectTeamMembers.teamMemberId, projects.id, projects.name);

    return rows.map((row) => ({ ...row, hours: Number(row.hours ?? 0) }));
  }

  async listPlannedProjectHours(): Promise<ForecastProjectHoursSignal[]> {
    const rows = await this.db
      .select({
        teamMemberId: forecastAssignments.teamMemberId,
        projectId: projects.id,
        projectName: projects.name,
        hours: sum(forecastAssignments.assignedHours),
      })
      .from(forecastAssignments)
      .innerJoin(projects, eq(projects.id, forecastAssignments.projectId))
      .where(inArray(forecastAssignments.type, ['project', 'support']))
      .groupBy(forecastAssignments.teamMemberId, projects.id, projects.name);

    return rows.map((row) => ({ ...row, hours: Number(row.hours ?? 0) }));
  }

  async listLoggedHours(start: Date, end: Date): Promise<ForecastLoggedHoursSignal[]> {
    const rows = await this.db
      .select({ userId: hourEntries.userId, hours: sum(hourEntries.hours) })
      .from(hourEntries)
      .where(and(gte(hourEntries.date, start), lte(hourEntries.date, end), ne(hourEntries.status, 'rejected')))
      .groupBy(hourEntries.userId);

    return rows.map((row) => ({ userId: row.userId, hours: Number(row.hours ?? 0) }));
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
