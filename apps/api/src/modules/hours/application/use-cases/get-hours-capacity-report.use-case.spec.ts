import { describe, expect, it } from 'vitest';
import type { Holiday, ListCapacityReportQuery } from '@kora/contracts';
import { GetHoursCapacityReportUseCase } from './get-hours-capacity-report.use-case';
import { InMemoryHourEntryRepository } from '../../../../test/fakes/in-memory-hour-entry.repository';
import type { HourEntryListItem } from '../../domain/repositories/hour-entry.repository';
import type { DrizzleHolidayReader } from '../../infrastructure/persistence/drizzle-holiday-reader';

function fakeHolidayReader(holidays: Holiday[] = []): DrizzleHolidayReader {
  return { list: async () => holidays } as unknown as DrizzleHolidayReader;
}

function buildItem(overrides: Partial<HourEntryListItem>): HourEntryListItem {
  return {
    id: 'entry-1',
    userId: 'user-1',
    userFullName: 'Ana Soto',
    projectId: 'project-1',
    projectName: 'Portal Clientes',
    teamId: null,
    teamName: null,
    assignment: 'Proyecto',
    category: '',
    description: '',
    hours: 8,
    date: new Date('2026-08-10T00:00:00.000Z'),
    isOvertime: false,
    status: 'approved',
    rejectionReason: null,
    designatedApproverUserId: null,
    designatedApproverFullName: null,
    projectApprovers: [],
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    decisionUserId: 'leader-1',
    decisionByFullName: 'Carla Líder',
    clientId: 'client-1',
    clientName: 'Acme SpA',
    projectType: 'development',
    projectSalesStage: 'approved',
    ...overrides,
  };
}

function buildQuery(overrides: Partial<ListCapacityReportQuery> = {}): ListCapacityReportQuery {
  return { page: 1, pageSize: 25, periodStart: '2026-08-01', sortField: 'periodDate', sortDirection: 'desc', ...overrides };
}

describe('GetHoursCapacityReportUseCase', () => {
  it('calcula el % de dedicación mensual sobre los días hábiles, descontando feriados', async () => {
    // Agosto 2026: 21 días hábiles (L-V) - 1 feriado = 20 días hábiles => 160 horas laborales.
    // Ana registra 80h aprobadas en el mes => 50% de dedicación.
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'e1', hours: 40, date: new Date('2026-08-03T00:00:00.000Z') }),
      buildItem({ id: 'e2', hours: 40, date: new Date('2026-08-10T00:00:00.000Z') }),
    );
    const holidays: Holiday[] = [{ id: 'h1', date: '2026-08-17', name: 'Feriado de prueba', type: 'national', isWorkingDay: false }];
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader(holidays));

    const result = await useCase.execute({ query: buildQuery() });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items.every((row) => row.dedicationPercent === 50)).toBe(true);
  });

  it('resuelve el tipo de HH igual que la v1 (capacityHHType)', async () => {
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'support', projectType: 'support', projectSalesStage: 'approved' }),
      buildItem({ id: 'prospect', projectSalesStage: 'prospect' }),
      buildItem({ id: 'quoted', projectSalesStage: 'quoted' }),
      buildItem({ id: 'project', projectType: 'development', projectSalesStage: 'approved' }),
      buildItem({ id: 'no-project', projectId: null, projectName: null, clientId: null, clientName: null, assignment: 'Vacaciones' }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery({ pageSize: 200 }) });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const typeById = new Map(result.value.items.map((row) => [row.id, row.type]));
    expect(typeById.get('support')).toBe('Soporte');
    expect(typeById.get('prospect')).toBe('Prospecto');
    expect(typeById.get('quoted')).toBe('Cotización');
    expect(typeById.get('project')).toBe('Proyecto');
    expect(typeById.get('no-project')).toBe('Vacaciones');
  });

  it('solo trae horas aprobadas del mes pedido', async () => {
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'in-month', date: new Date('2026-08-15T00:00:00.000Z'), status: 'approved' }),
      buildItem({ id: 'pending', date: new Date('2026-08-15T00:00:00.000Z'), status: 'pending' }),
      buildItem({ id: 'other-month', date: new Date('2026-09-01T00:00:00.000Z'), status: 'approved' }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery({ periodStart: '2026-08-05' }) });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items.map((row) => row.id)).toEqual(['in-month']);
  });

  it('filtra por búsqueda y pagina en memoria', async () => {
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'a', clientName: 'Acme SpA' }),
      buildItem({ id: 'b', clientName: 'Otro Cliente' }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery({ search: 'acme' }) });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.total).toBe(1);
    expect(result.value.items[0]?.id).toBe('a');
  });
});
