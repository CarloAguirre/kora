import { Inject, Injectable } from '@nestjs/common';
import { buildPage, ok, type Page, type Result } from '@kora/core';
import type { CapacityReportRow, ListCapacityReportQuery } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryListItem, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { DrizzleHolidayReader } from '../../infrastructure/persistence/drizzle-holiday-reader';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetHoursCapacityReportCommand {
  readonly query: ListCapacityReportQuery;
}

/** Suficiente para traer todas las horas aprobadas de un mes de una organización de este tamaño. */
const MONTH_ENTRIES_PAGE_SIZE = 20_000;

/**
 * Reporte "Capacity" de Administración — ver la v1 `Usuarios/index.tsx`
 * (pestaña `capacity`, líneas 646-797) y `src/utils/capacityHHType.ts`.
 *
 * Solo se llama con `hours:read_all` ya verificado por el controlador — por
 * eso pide todas las horas aprobadas del mes sin `visibleToUserIds`.
 */
@Injectable()
export class GetHoursCapacityReportUseCase implements UseCase<GetHoursCapacityReportCommand, Page<CapacityReportRow>, never> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    private readonly holidays: DrizzleHolidayReader,
  ) {}

  async execute(command: GetHoursCapacityReportCommand): Promise<Result<Page<CapacityReportRow>, never>> {
    const { query } = command;
    const monthStart = monthStartOf(query.periodStart);
    const monthEnd = monthEndOf(monthStart);

    const [monthPage, holidayRows] = await Promise.all([
      this.hourEntries.search(
        { status: 'approved', dateFrom: monthStart, dateTo: monthEnd, visibleToUserIds: undefined },
        { page: 1, pageSize: MONTH_ENTRIES_PAGE_SIZE },
        { field: 'date', direction: 'desc' },
      ),
      this.holidays.list(toIsoDate(monthStart), toIsoDate(monthEnd)),
    ]);

    const holidayDates = new Set(holidayRows.map((h) => h.date));
    const laborHours = countBusinessDays(monthStart, monthEnd, holidayDates) * 8;

    const monthlyHoursByUser = new Map<string, number>();
    for (const item of monthPage.items) {
      monthlyHoursByUser.set(item.userId, (monthlyHoursByUser.get(item.userId) ?? 0) + item.hours);
    }

    const rows = monthPage.items.map((item) => toCapacityReportRow(item, laborHours, monthlyHoursByUser.get(item.userId) ?? 0));

    const term = query.search?.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) =>
          [row.supervisorFullName, row.collaboratorFullName, row.clientName, row.projectName, row.type]
            .some((value) => value.toLowerCase().includes(term)),
        )
      : rows;

    const sorted = sortRows(filtered, query.sortField, query.sortDirection);

    const start = (query.page - 1) * query.pageSize;
    const items = sorted.slice(start, start + query.pageSize);

    return ok(buildPage(items, sorted.length, { page: query.page, pageSize: query.pageSize }));
  }
}

function toCapacityReportRow(item: HourEntryListItem, laborHours: number, monthlyHours: number): CapacityReportRow {
  return {
    id: item.id,
    supervisorFullName: item.decisionByFullName || '--',
    collaboratorFullName: item.userFullName,
    periodDate: toIsoDate(item.date),
    clientName: item.clientName || '--',
    projectName: item.projectName || '--',
    type: resolveCapacityType(item),
    dedicatedHours: item.hours,
    dedicatedDays: 1,
    dedicationPercent: laborHours > 0 ? Math.round((monthlyHours / laborHours) * 100) : 0,
    monthKey: toIsoDate(item.date).slice(0, 7),
  };
}

/** Misma regla que `getCapacityHHType` en la v1 (`src/utils/capacityHHType.ts`). */
function resolveCapacityType(item: HourEntryListItem): string {
  if (!item.projectId) return (item.assignment || item.category || 'Sin proyecto').trim() || 'Sin proyecto';
  if (item.projectSalesStage === 'prospect') return 'Prospecto';
  if (item.projectSalesStage === 'quoted') return 'Cotización';
  if (item.projectType === 'support') return 'Soporte';
  return 'Proyecto';
}

function sortRows(
  rows: readonly CapacityReportRow[],
  field: ListCapacityReportQuery['sortField'],
  direction: ListCapacityReportQuery['sortDirection'],
): CapacityReportRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
    return String(av).localeCompare(String(bv), 'es') * sign;
  });
}

function monthStartOf(iso: string): Date {
  const parts = iso.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthEndOf(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countBusinessDays(start: Date, end: Date, holidayDates: ReadonlySet<string>): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6 && !holidayDates.has(toIsoDate(current))) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}
