import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  forecastAssignments,
  gte,
  holidays,
  inArray,
  isNull,
  lte,
  projectModules,
  projects,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ForecastMemberLabel,
  ForecastSourceModuleRef,
  ForecastSourceStore,
  ForecastSourceTarget,
  ForecastSyncChange,
} from '../../application/ports/forecast-source-store.port';
import type { PlannedForecastWeek } from '../../application/services/forecast-planner';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

type AssignmentRow = typeof forecastAssignments.$inferSelect;

/**
 * Escribe directo en `forecast_assignments` en vez de pasar por el repositorio de Forecast: ese
 * módulo ya depende de `ProjectsModule` (lector de proyectos) y la dependencia inversa haría un ciclo.
 * Las filas se crean con las mismas reglas que valida `ForecastAssignment` (semana lunes-viernes,
 * HH ≥ 0) — las garantizan `planSegmentForecast` y `planTaskForecast`.
 */
@Injectable()
export class DrizzleForecastSourceStore implements ForecastSourceStore {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listNonWorkingDates(start: Date, end: Date, context?: TransactionContext): Promise<Date[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(eq(holidays.isWorkingDay, false), gte(holidays.date, start), lte(holidays.date, end)));
    return rows.map((row) => row.date);
  }

  async findActiveTeamMemberId(
    userId: string,
    preferredTeamId: string | null,
    context?: TransactionContext,
  ): Promise<string | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ id: teamMembers.id, teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt), isNull(teams.deletedAt)))
      .orderBy(asc(teamMembers.joinedAt));
    return (rows.find((row) => row.teamId === preferredTeamId) ?? rows[0])?.id ?? null;
  }

  async syncSource(
    target: ForecastSourceTarget,
    weeks: readonly PlannedForecastWeek[],
    now: Date,
    context?: TransactionContext,
  ): Promise<ForecastSyncChange[]> {
    const db = resolveDb(this.database, context);
    const sourceFilter =
      target.source.kind === 'segment'
        ? eq(forecastAssignments.segmentId, target.source.segmentId)
        : eq(forecastAssignments.taskId, target.source.taskId);
    const existing = await db.select().from(forecastAssignments).where(sourceFilter);

    const pending = new Map(existing.map((row) => [weekKey(row.teamMemberId, row.periodStart), row]));
    const changes: ForecastSyncChange[] = [];

    for (const week of weeks) {
      const key = weekKey(week.teamMemberId, week.periodStart);
      const row = pending.get(key);
      pending.delete(key);

      if (!row) {
        const [inserted] = await db
          .insert(forecastAssignments)
          .values({
            teamMemberId: week.teamMemberId,
            periodStart: week.periodStart,
            periodEnd: week.periodEnd,
            type: 'project',
            projectId: target.projectId,
            clientId: target.clientId,
            assignedHours: String(week.assignedHours),
            calculatedHours: String(week.assignedHours),
            source: target.source.kind,
            segmentId: target.source.kind === 'segment' ? target.source.segmentId : null,
            taskId: target.source.kind === 'task' ? target.source.taskId : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: forecastAssignments.id });
        changes.push(change('create', inserted!.id, week, week.assignedHours, false));
        continue;
      }

      const result = await this.applyCalculation(row, week.assignedHours, target, now, context);
      if (result) changes.push(result);
    }

    // Semanas que el cálculo ya no produce.
    for (const row of pending.values()) {
      if (row.adjustedAt) {
        const result = await this.applyCalculation(row, 0, target, now, context);
        if (result) changes.push(result);
        continue;
      }
      await db.delete(forecastAssignments).where(eq(forecastAssignments.id, row.id));
      changes.push(change('delete', row.id, row, null, false));
    }

    return changes;
  }

  /** Actualiza una fila existente con el nuevo cálculo; devuelve el cambio visible para el historial, si lo hubo. */
  private async applyCalculation(
    row: AssignmentRow,
    calculated: number,
    target: ForecastSourceTarget,
    now: Date,
    context?: TransactionContext,
  ): Promise<ForecastSyncChange | null> {
    const db = resolveDb(this.database, context);
    const previousCalculation = Number(row.calculatedHours ?? row.assignedHours);
    const calculationChanged = previousCalculation !== calculated;
    const referencesChanged = row.projectId !== target.projectId || row.clientId !== target.clientId;

    if (row.adjustedAt) {
      if (!calculationChanged && !referencesChanged) return null;
      const becameStale = calculationChanged && !row.isStale;
      await db
        .update(forecastAssignments)
        .set({
          calculatedHours: String(calculated),
          isStale: row.isStale || calculationChanged,
          projectId: target.projectId,
          clientId: target.clientId,
          updatedAt: now,
        })
        .where(eq(forecastAssignments.id, row.id));
      return becameStale ? change('update', row.id, row, Number(row.assignedHours), true) : null;
    }

    const hoursChanged = Number(row.assignedHours) !== calculated;
    if (!calculationChanged && !hoursChanged && !referencesChanged) return null;
    await db
      .update(forecastAssignments)
      .set({
        calculatedHours: String(calculated),
        assignedHours: String(calculated),
        projectId: target.projectId,
        clientId: target.clientId,
        updatedAt: now,
      })
      .where(eq(forecastAssignments.id, row.id));
    return hoursChanged ? change('update', row.id, row, calculated, false) : null;
  }

  async listMemberLabels(teamMemberIds: readonly string[], context?: TransactionContext): Promise<ForecastMemberLabel[]> {
    if (teamMemberIds.length === 0) return [];
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        teamMemberId: teamMembers.id,
        firstName: users.firstName,
        lastName: users.lastName,
        teamId: teams.id,
        teamName: teams.name,
        weeklyHours: teamMembers.weeklyHours,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .leftJoin(users, eq(users.id, teamMembers.userId))
      .where(inArray(teamMembers.id, [...teamMemberIds]));
    return rows.map((row) => ({
      teamMemberId: row.teamMemberId,
      fullName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(),
      teamId: row.teamId,
      teamName: row.teamName,
      weeklyHours: Number(row.weeklyHours),
    }));
  }

  async listLiveModules(context?: TransactionContext): Promise<ForecastSourceModuleRef[]> {
    const db = resolveDb(this.database, context);
    return db
      .select({
        projectId: projects.id,
        clientId: projects.clientId,
        projectName: projects.name,
        moduleId: projectModules.id,
      })
      .from(projectModules)
      .innerJoin(projects, eq(projects.id, projectModules.projectId))
      .where(and(isNull(projects.deletedAt), inArray(projects.status, ['draft', 'active', 'on_hold'])));
  }
}

function weekKey(teamMemberId: string, periodStart: Date): string {
  return `${teamMemberId}|${periodStart.toISOString().slice(0, 10)}`;
}

function change(
  action: ForecastSyncChange['action'],
  assignmentId: string,
  week: { teamMemberId: string; periodStart: Date; periodEnd: Date },
  assignedHours: number | null,
  becameStale: boolean,
): ForecastSyncChange {
  return {
    action,
    assignmentId,
    teamMemberId: week.teamMemberId,
    periodStart: week.periodStart,
    periodEnd: week.periodEnd,
    assignedHours,
    becameStale,
  };
}
