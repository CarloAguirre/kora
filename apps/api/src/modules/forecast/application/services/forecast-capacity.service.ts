import { Inject, Injectable } from '@nestjs/common';
import type {
  ForecastAssignmentType,
  ForecastCapacityItem,
  ForecastCapacityMember,
  ForecastHoursOrigin,
  ForecastWeekCell,
  ForecastWeeksResponse,
} from '@kora/contracts';
import { FORECAST_HOLIDAY_READER, type ForecastHolidayReader } from '../ports/forecast-holiday-reader.port';
import { FORECAST_TEAM_READER, type ForecastTeamMemberReference, type ForecastTeamReader } from '../ports/forecast-team-reader.port';
import {
  FORECAST_PLANNING_SIGNALS_READER,
  type ForecastDeliverySignal,
  type ForecastPlanningSignalsReader,
} from '../ports/forecast-planning-signals-reader.port';
import {
  FORECAST_ASSIGNMENT_REPOSITORY,
  type ForecastAssignmentRawRow,
  type ForecastAssignmentRepository,
} from '../../domain/repositories/forecast-assignment.repository';
import { coverPlannedHours } from './forecast-planned-coverage';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tiempo fuera del trabajo — en "Próximas semanas" se pinta como ausencia. */
const ABSENCE_TYPES = new Set<string>(['vacation', 'admin_day', 'day_off', 'sick_leave']);

/** Diferencias menores no son "horas sin calendarizar": son redondeos del reparto semanal. */
const UNSCHEDULED_TOLERANCE_HOURS = 1;

interface AggregatedItem {
  type: string;
  projectId: string | null;
  projectName: string | null;
  hours: number;
  comments: Set<string>;
  origin: ForecastHoursOrigin;
  isStale: boolean;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function originOf(row: ForecastAssignmentRawRow): ForecastHoursOrigin {
  if (row.source === 'manual') return 'manual';
  return row.isAdjusted ? 'adjusted' : 'calculated';
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * Capacidad disponible por período — y su agregación por colaborador.
 *
 * Reemplaza el cálculo `días_hábiles × 8` (igual para todos) que usaba la v1
 * — ver docs/DECISION-M6-FORECAST.md. La capacidad de cada colaborador es su
 * `weeklyHours` real, prorrateada por los días hábiles del período (siempre
 * una semana completa salvo que un feriado la reduzca).
 *
 * Junto a las HH agrega lo que viene de los proyectos sin sumar horas: entregas, tareas que ya
 * cubre un tramo, HH asignadas sin calendarizar y horas registradas (plan contra real).
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
    @Inject(FORECAST_PLANNING_SIGNALS_READER) private readonly signals: ForecastPlanningSignalsReader,
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
    const [members, rawRows, fraction, deliveries, containedTasks, assignedHours, plannedHours, loggedHours] = await Promise.all([
      this.teams.listAllActiveMembers(),
      this.assignments.listRawForWeeks(periodStart, periodStart),
      this.businessDayFraction(periodStart, periodEnd),
      this.signals.listDeliveries(periodStart, periodEnd),
      this.signals.listContainedTasks(periodStart, periodEnd),
      this.signals.listAssignedProjectHours(),
      this.signals.listPlannedProjectHours(),
      this.signals.listLoggedHours(periodStart, periodEnd),
    ]);

    const rowsByMember = groupBy(coverPlannedHours(rawRows), (row) => row.teamMemberId);
    const deliveriesByMember = this.deliveriesByMember(members, deliveries);
    const containedByMember = groupBy(containedTasks, (task) => task.teamMemberId);
    const plannedByKey = new Map(plannedHours.map((row) => [`${row.teamMemberId}|${row.projectId}`, row.hours]));
    const assignedByMember = groupBy(assignedHours, (row) => row.teamMemberId);
    const loggedByUser = new Map(loggedHours.map((row) => [row.userId, row.hours]));

    return members.map((member) => {
      const capacityHours = this.capacityHoursFor(member.weeklyHours, fraction);
      const items = aggregateItems(rowsByMember.get(member.id) ?? []);
      const assigned = round2(items.reduce((total, item) => total + item.hours, 0));
      const loadPercent = capacityHours > 0 ? Math.round((assigned / capacityHours) * 100) : 0;

      return {
        teamMemberId: member.id,
        fullName: member.fullName,
        teamId: member.teamId,
        teamName: member.teamName,
        capacityHours,
        assignedHours: assigned,
        loadPercent,
        items,
        deliveries: (deliveriesByMember.get(member.id) ?? []).map((delivery) => ({
          id: delivery.id,
          name: delivery.name,
          projectName: delivery.projectName,
          moduleName: delivery.moduleName,
          date: toIsoDate(delivery.date),
        })),
        containedTasks: (containedByMember.get(member.id) ?? []).map((task) => ({
          id: task.id,
          name: task.name,
          projectName: task.projectName,
          moduleName: task.moduleName,
          startDate: toIsoDate(task.startDate),
          date: toIsoDate(task.date),
          estimatedHours: task.estimatedHours,
        })),
        unscheduled: (assignedByMember.get(member.id) ?? [])
          .map((row) => ({
            projectId: row.projectId,
            projectName: row.projectName,
            assignedHours: round2(row.hours),
            plannedHours: round2(plannedByKey.get(`${member.id}|${row.projectId}`) ?? 0),
          }))
          .filter((row) => row.assignedHours - row.plannedHours >= UNSCHEDULED_TOLERANCE_HOURS),
        loggedHours: round2(loggedByUser.get(member.userId) ?? 0),
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

  /** "Próximas semanas": carga de cada colaborador activo en `weeks` semanas desde `firstMonday`. */
  async getWeeksSummary(firstMonday: Date, weeks: number): Promise<ForecastWeeksResponse> {
    const lastMonday = addDays(firstMonday, (weeks - 1) * 7);
    const lastFriday = addDays(lastMonday, 4);
    const [members, rawRows, nonWorking, deliveries] = await Promise.all([
      this.teams.listAllActiveMembers(),
      this.assignments.listRawForWeeks(firstMonday, lastMonday),
      this.holidays.listNonWorkingDates(firstMonday, lastFriday),
      this.signals.listDeliveries(firstMonday, lastFriday),
    ]);

    const nonWorkingDates = new Set(nonWorking.map(toIsoDate));
    const weekList = Array.from({ length: weeks }, (_, index) => {
      const periodStart = addDays(firstMonday, index * 7);
      const periodEnd = addDays(periodStart, 4);
      return { periodStart, periodEnd, businessDays: countBusinessDays(periodStart, periodEnd, nonWorkingDates) };
    });

    const rowsByMemberWeek = groupBy(coverPlannedHours(rawRows), (row) => `${row.teamMemberId}|${toIsoDate(row.periodStart)}`);
    const deliveriesByMember = this.deliveriesByMember(members, deliveries);

    return {
      weeks: weekList.map((week) => ({
        periodStart: toIsoDate(week.periodStart),
        periodEnd: toIsoDate(week.periodEnd),
        businessDays: week.businessDays,
      })),
      members: members.map((member) => ({
        teamMemberId: member.id,
        fullName: member.fullName,
        teamId: member.teamId,
        teamName: member.teamName,
        cells: weekList.map((week): ForecastWeekCell => {
          const rows = rowsByMemberWeek.get(`${member.id}|${toIsoDate(week.periodStart)}`) ?? [];
          const capacityHours = this.capacityHoursFor(member.weeklyHours, week.businessDays / 5);
          const assignedHours = round2(rows.reduce((total, row) => total + row.assignedHours, 0));
          const memberDeliveries = (deliveriesByMember.get(member.id) ?? []).filter(
            (delivery) => delivery.date >= week.periodStart && delivery.date <= week.periodEnd,
          );
          return {
            periodStart: toIsoDate(week.periodStart),
            capacityHours,
            assignedHours,
            loadPercent: capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : 0,
            absenceHours: round2(rows.filter((row) => ABSENCE_TYPES.has(row.type)).reduce((total, row) => total + row.assignedHours, 0)),
            hasAdjusted: rows.some((row) => row.isAdjusted),
            hasStale: rows.some((row) => row.isStale),
            deliveryCount: memberDeliveries.length,
          };
        }),
      })),
    };
  }

  /**
   * Las entregas se asignan a una persona (usuario), y el Forecast es por pertenencia a un equipo:
   * si la entrega indica equipo y la persona está en él, va a esa pertenencia; si no, a todas las suyas.
   */
  private deliveriesByMember(
    members: readonly ForecastTeamMemberReference[],
    deliveries: readonly ForecastDeliverySignal[],
  ): Map<string, ForecastDeliverySignal[]> {
    const membersByUser = groupBy(members, (member) => member.userId);
    const result = new Map<string, ForecastDeliverySignal[]>();
    for (const delivery of deliveries) {
      const memberships = membersByUser.get(delivery.assigneeUserId) ?? [];
      const inTeam = memberships.filter((member) => member.teamId === delivery.teamId);
      for (const member of inTeam.length > 0 ? inTeam : memberships) {
        const list = result.get(member.id);
        if (list) list.push(delivery);
        else result.set(member.id, [delivery]);
      }
    }
    return result;
  }
}

/** Agrupa por tipo, proyecto y origen — así un ajuste del líder se ve aparte de lo calculado. */
function aggregateItems(rows: readonly ForecastAssignmentRawRow[]): ForecastCapacityItem[] {
  const itemsByKey = new Map<string, AggregatedItem>();
  for (const row of rows) {
    const origin = originOf(row);
    const key = `${row.type}:${row.projectId ?? ''}:${origin}`;
    const existing = itemsByKey.get(key);
    if (existing) {
      existing.hours += row.assignedHours;
      existing.isStale ||= row.isStale;
      if (row.comments) existing.comments.add(row.comments);
    } else {
      itemsByKey.set(key, {
        type: row.type,
        projectId: row.projectId,
        projectName: row.projectName,
        hours: row.assignedHours,
        comments: new Set(row.comments ? [row.comments] : []),
        origin,
        isStale: row.isStale,
      });
    }
  }

  return [...itemsByKey.values()].map((item) => ({
    type: item.type as ForecastAssignmentType,
    projectId: item.projectId,
    projectName: item.projectName,
    hours: round2(item.hours),
    comments: [...item.comments],
    origin: item.origin,
    isStale: item.isStale,
  }));
}
