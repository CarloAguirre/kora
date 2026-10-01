import { Inject, Injectable } from '@nestjs/common';
import { and, eq, forecastAssignments, gte, holidays, lte, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  SegmentForecastStore,
  SegmentForecastTarget,
} from '../../application/ports/segment-forecast-store.port';
import type { SegmentForecastWeek } from '../../application/services/segment-forecast-planner';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

/**
 * Escribe directo en `forecast_assignments` en vez de pasar por el repositorio de Forecast: ese
 * módulo ya depende de `ProjectsModule` (lector de proyectos) y la dependencia inversa haría un ciclo.
 * Las filas se crean con las mismas reglas que valida `ForecastAssignment` (semana lunes-viernes,
 * HH ≥ 0) — las garantiza `planSegmentForecast`.
 */
@Injectable()
export class DrizzleSegmentForecastStore implements SegmentForecastStore {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listNonWorkingDates(start: Date, end: Date, context?: TransactionContext): Promise<Date[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(eq(holidays.isWorkingDay, false), gte(holidays.date, start), lte(holidays.date, end)));
    return rows.map((row) => row.date);
  }

  async replaceForSegment(
    target: SegmentForecastTarget,
    weeks: readonly SegmentForecastWeek[],
    now: Date,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(forecastAssignments).where(eq(forecastAssignments.segmentId, target.segmentId));
    if (weeks.length === 0) return;

    await db.insert(forecastAssignments).values(
      weeks.map((week) => ({
        teamMemberId: week.teamMemberId,
        periodStart: week.periodStart,
        periodEnd: week.periodEnd,
        type: 'project' as const,
        projectId: target.projectId,
        clientId: target.clientId,
        comments: target.comments,
        assignedHours: String(week.assignedHours),
        segmentId: target.segmentId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
}
