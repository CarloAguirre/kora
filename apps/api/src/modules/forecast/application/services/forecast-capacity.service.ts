import { Inject, Injectable } from '@nestjs/common';
import type { ForecastAssignmentType, ForecastCapacityMember } from '@kora/contracts';
import { FORECAST_HOLIDAY_READER, type ForecastHolidayReader } from '../ports/forecast-holiday-reader.port';
import { FORECAST_TEAM_READER, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import {
  FORECAST_ASSIGNMENT_REPOSITORY,
  type ForecastAssignmentRawRow,
  type ForecastAssignmentRepository,
} from '../../domain/repositories/forecast-assignment.repository';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface AggregatedItem {
  type: string;
  projectId: string | null;
  projectName: string | null;
  hours: number;
  comments: Set<string>;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countBusinessDays(start: Date, end: Date, nonWorkingDates: ReadonlySet<string>): number {
  let count = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
    const cursor = new Date(time);
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !nonWorkingDates.has(toIsoDate(cursor))) count++;
  }
  return count;
}

/**
 * Capacidad disponible por período — y su agregación por colaborador.
 *
 * Reemplaza el cálculo `días_hábiles × 8` (igual para todos) que usaba la v1
 * — ver docs/DECISION-M6-FORECAST.md. La capacidad de cada colaborador es su
 * `weeklyHours` real, prorrateada por los días hábiles del período (siempre
 * una semana completa salvo que un feriado la reduzca).
 *
 * La agregación por colaborador vive aquí, como servicio de aplicación, en
 * vez de en `GetForecastCapacityUseCase` directamente — así el panel (M7) la
 * reutiliza sin encadenar casos de uso (ver `architecture.spec.ts`,
 * "ningún caso de uso importa otro caso de uso").
 */
@Injectable()
export class ForecastCapacityService {
  constructor(
    @Inject(FORECAST_HOLIDAY_READER) private readonly holidays: ForecastHolidayReader,
    @Inject(FORECAST_ASSIGNMENT_REPOSITORY) private readonly assignments: ForecastAssignmentRepository,
    @Inject(FORECAST_TEAM_READER) private readonly teams: ForecastTeamReader,
  ) {}

  async businessDayFraction(periodStart: Date, periodEnd: Date): Promise<number> {
    const nonWorking = await this.holidays.listNonWorkingDates(periodStart, periodEnd);
    const nonWorkingDates = new Set(nonWorking.map(toIsoDate));
    const businessDays = countBusinessDays(periodStart, periodEnd, nonWorkingDates);
    return businessDays / 5;
  }

  capacityHoursFor(weeklyHours: number, fraction: number): number {
    return Math.round(weeklyHours * fraction * 100) / 100;
  }

  /** Capacidad y asignación agregadas por colaborador, para todos los miembros activos. */
  async getCapacitySummary(periodStart: Date, periodEnd: Date): Promise<ForecastCapacityMember[]> {
    const [members, rawRows, fraction] = await Promise.all([
      this.teams.listAllActiveMembers(),
      this.assignments.listRawForPeriod(periodStart, periodEnd),
      this.businessDayFraction(periodStart, periodEnd),
    ]);

    const rowsByMember = new Map<string, ForecastAssignmentRawRow[]>();
    for (const row of rawRows) {
      const list = rowsByMember.get(row.teamMemberId);
      if (list) list.push(row);
      else rowsByMember.set(row.teamMemberId, [row]);
    }

    return members.map((member) => {
      const rows = rowsByMember.get(member.id) ?? [];
      const capacityHours = this.capacityHoursFor(member.weeklyHours, fraction);

      const itemsByKey = new Map<string, AggregatedItem>();
      for (const row of rows) {
        const key = `${row.type}:${row.projectId ?? ''}`;
        const existing = itemsByKey.get(key);
        if (existing) {
          existing.hours += row.assignedHours;
          if (row.comments) existing.comments.add(row.comments);
        } else {
          itemsByKey.set(key, {
            type: row.type,
            projectId: row.projectId,
            projectName: row.projectName,
            hours: row.assignedHours,
            comments: new Set(row.comments ? [row.comments] : []),
          });
        }
      }

      const items = [...itemsByKey.values()].map((item) => ({
        type: item.type as ForecastAssignmentType,
        projectId: item.projectId,
        projectName: item.projectName,
        hours: item.hours,
        comments: [...item.comments],
      }));
      const assignedHours = items.reduce((sum, item) => sum + item.hours, 0);
      const loadPercent = capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : 0;

      return {
        teamMemberId: member.id,
        fullName: member.fullName,
        teamId: member.teamId,
        teamName: member.teamName,
        capacityHours,
        assignedHours,
        loadPercent,
        items,
      };
    });
  }

  /**
   * Igual que `getCapacitySummary`, pero con el `userId` de cada miembro —
   * uso interno del Dashboard (M7) para ubicar la fila propia del actor y la
   * de su equipo; `userId` no forma parte del contrato público de
   * `/forecast/capacity` así que no se agrega ahí, solo en este método.
   */
  async getCapacitySummaryWithUserIds(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<ForecastCapacityMember & { userId: string }>> {
    const [summary, members] = await Promise.all([
      this.getCapacitySummary(periodStart, periodEnd),
      this.teams.listAllActiveMembers(),
    ]);
    const userIdByTeamMemberId = new Map(members.map((member) => [member.id, member.userId]));
    return summary.map((member) => ({ ...member, userId: userIdByTeamMemberId.get(member.teamMemberId) ?? '' }));
  }
}
