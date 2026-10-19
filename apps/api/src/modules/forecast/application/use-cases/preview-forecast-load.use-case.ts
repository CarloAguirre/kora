import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { ForecastLoadPreviewInput, ForecastLoadPreviewResponse, ForecastOverloadWarning } from '@kora/contracts';
import { FORECAST_ASSIGNMENT_REPOSITORY, type ForecastAssignmentRepository } from '../../domain/repositories/forecast-assignment.repository';
import { FORECAST_SOURCE_CALCULATOR, type ForecastSourceCalculator, type PlannedLoadWeek } from '../ports/forecast-source-calculator.port';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import { ForecastCapacityService } from '../services/forecast-capacity.service';
import { isManualPlanning } from '../services/forecast-planned-coverage';
import type { UseCase } from '../../../../shared/application/use-case';

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Antes de guardar un tramo o una tarea: ¿deja a alguien sobre su capacidad? Calcula las HH que
 * agregaría (mismo cálculo que el Forecast) y las suma a lo que la persona ya tiene cada semana en
 * tramos, tareas, ausencias y otras actividades — no las HH de proyecto planificadas a mano en el
 * Forecast, que se van ajustando ahí — sin contar las filas del mismo tramo/tarea si se está editando.
 * Avisa las semanas en que la persona ya estaba al 100 % o lo pasaría. Solo semanas que no terminaron:
 * el pasado ya no se puede replanificar.
 */
@Injectable()
export class PreviewForecastLoadUseCase implements UseCase<ForecastLoadPreviewInput, ForecastLoadPreviewResponse, ApplicationError> {
  constructor(
    @Inject(FORECAST_SOURCE_CALCULATOR) private readonly calculator: ForecastSourceCalculator,
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
    private readonly capacity: ForecastCapacityService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ForecastLoadPreviewInput): Promise<Result<ForecastLoadPreviewResponse, ApplicationError>> {
    const today = toDate(toIsoDate(this.clock.now()));
    const planned = (await this.plan(input)).filter((week) => week.assignedHours > 0 && week.periodEnd >= today);
    if (planned.length === 0) return ok({ warnings: [] });

    const mondays = planned.map((week) => week.periodStart.getTime());
    const existing = await this.assignments.listRawForWeeks(new Date(Math.min(...mondays)), new Date(Math.max(...mondays)));
    const excludedSegmentId = input.kind === 'segment' ? (input.segmentId ?? null) : null;
    const excludedTaskId = input.kind === 'task' ? (input.taskId ?? null) : null;

    const currentByKey = new Map<string, number>();
    for (const row of existing) {
      if ((excludedSegmentId && row.segmentId === excludedSegmentId) || (excludedTaskId && row.taskId === excludedTaskId)) continue;
      if (isManualPlanning(row)) continue;
      const key = `${row.teamMemberId}|${toIsoDate(row.periodStart)}`;
      currentByKey.set(key, (currentByKey.get(key) ?? 0) + row.assignedHours);
    }

    const warnings: ForecastOverloadWarning[] = [];
    const members = new Map<string, Awaited<ReturnType<ForecastTeamReader['findMemberById']>>>();
    for (const week of this.mergeByMemberWeek(planned)) {
      if (!members.has(week.teamMemberId)) members.set(week.teamMemberId, await this.teams.findMemberById(week.teamMemberId));
      const member = members.get(week.teamMemberId);
      if (!member) continue;

      const fraction = await this.capacity.businessDayFraction(week.periodStart, week.periodEnd);
      const capacityHours = this.capacity.capacityHoursFor(member.weeklyHours, fraction);
      const currentHours = round2(currentByKey.get(`${week.teamMemberId}|${toIsoDate(week.periodStart)}`) ?? 0);
      const totalHours = round2(currentHours + week.assignedHours);
      if (capacityHours <= 0 || (currentHours < capacityHours && totalHours <= capacityHours)) continue;

      warnings.push({
        teamMemberId: member.id,
        fullName: member.fullName,
        periodStart: toIsoDate(week.periodStart),
        periodEnd: toIsoDate(week.periodEnd),
        capacityHours,
        currentHours,
        addedHours: round2(week.assignedHours),
        totalHours,
        loadPercent: Math.round((totalHours / capacityHours) * 100),
      });
    }

    return ok({ warnings });
  }

  private plan(input: ForecastLoadPreviewInput): Promise<PlannedLoadWeek[]> {
    if (input.kind === 'segment') {
      return this.calculator.previewSegment({
        startDate: toDate(input.startDate),
        endDate: toDate(input.endDate),
        members: input.members,
      });
    }
    return this.calculator.previewTask({
      moduleId: input.moduleId,
      teamId: input.teamId ?? null,
      assigneeUserId: input.assigneeUserId,
      startDate: toDate(input.startDate),
      date: toDate(input.date),
      estimatedHours: input.estimatedHours,
    });
  }

  /** Una fila por persona y semana, en orden — el plan ya viene así, pero no se asume. */
  private mergeByMemberWeek(weeks: readonly PlannedLoadWeek[]): PlannedLoadWeek[] {
    const byKey = new Map<string, PlannedLoadWeek>();
    for (const week of weeks) {
      const key = `${week.teamMemberId}|${week.periodStart.getTime()}`;
      const existing = byKey.get(key);
      byKey.set(key, existing ? { ...existing, assignedHours: existing.assignedHours + week.assignedHours } : week);
    }
    return [...byKey.values()].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime() || a.teamMemberId.localeCompare(b.teamMemberId),
    );
  }
}
