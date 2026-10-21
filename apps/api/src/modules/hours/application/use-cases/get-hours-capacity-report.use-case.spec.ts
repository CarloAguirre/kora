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
    moduleId: null,
    moduleName: null,
    teamId: null,
    teamName: null,
    assignment: 'Proyecto',
    category: '',
    description: '',
    hours: 8,
    date: new Date('2026-08-10T00:00:00.000Z'),
    isOvertime: false,
    projectStageAtEntry: null,
    status: 'approved',
    rejectionReason: null,
    hasBlocker: false,
    blockerDescription: null,
    designatedApproverUserId: null,
    designatedApproverFullName: null,
    projectApprovers: [],
    ticket: null,
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
  return { page: 1, pageSize: 25, dateFrom: '2026-08-01', dateTo: '2026-08-31', sortField: 'periodDate', sortDirection: 'desc', ...overrides };
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

  it('solo trae horas aprobadas del rango pedido', async () => {
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'in-month', date: new Date('2026-08-15T00:00:00.000Z'), status: 'approved' }),
      buildItem({ id: 'pending', date: new Date('2026-08-15T00:00:00.000Z'), status: 'pending' }),
      buildItem({ id: 'other-month', date: new Date('2026-09-01T00:00:00.000Z'), status: 'approved' }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery() });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items.map((row) => row.id)).toEqual(['in-month']);
  });

  it('con un rango parcial, el % de dedicación usa solo los días hábiles del rango', async () => {
    // 3 al 7 de agosto 2026: 5 días hábiles => 40 horas laborales; 20h => 50%.
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'in-range', hours: 20, date: new Date('2026-08-04T00:00:00.000Z') }),
      buildItem({ id: 'out-of-range', hours: 8, date: new Date('2026-08-10T00:00:00.000Z') }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery({ dateFrom: '2026-08-03', dateTo: '2026-08-07' }) });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items.map((row) => row.id)).toEqual(['in-range']);
    expect(result.value.items[0]?.dedicationPercent).toBe(50);
  });

  it('un rango de varios meses calcula el % de dedicación por mes', async () => {
    // Agosto 2026: 21 días hábiles => 168h; 84h => 50%. Septiembre 2026: 22 días hábiles => 176h; 44h => 25%.
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'aug', hours: 84, date: new Date('2026-08-03T00:00:00.000Z') }),
      buildItem({ id: 'sep', hours: 44, date: new Date('2026-09-07T00:00:00.000Z') }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery({ dateFrom: '2026-08-01', dateTo: '2026-09-30' }) });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const percentById = new Map(result.value.items.map((row) => [row.id, row.dedicationPercent]));
    expect(percentById.get('aug')).toBe(50);
    expect(percentById.get('sep')).toBe(25);
  });

  it('no cuenta horas extra: ni como filas ni en el % de dedicación', async () => {
    // Agosto 2026 sin feriados: 21 días hábiles => 168 horas laborales; 84h normales => 50%.
    const entries = new InMemoryHourEntryRepository().seed(
      buildItem({ id: 'regular', hours: 84, date: new Date('2026-08-03T00:00:00.000Z') }),
      buildItem({ id: 'overtime', hours: 10, isOvertime: true, date: new Date('2026-08-03T00:00:00.000Z') }),
    );
    const useCase = new GetHoursCapacityReportUseCase(entries, fakeHolidayReader());

    const result = await useCase.execute({ query: buildQuery() });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.items.map((row) => row.id)).toEqual(['regular']);
    expect(result.value.items[0]?.dedicationPercent).toBe(50);
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
