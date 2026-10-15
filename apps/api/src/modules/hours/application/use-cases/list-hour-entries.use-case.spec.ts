import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@kora/core';
import type { HourEntryFilters, HourEntryListItem, HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader, HourEntryProjectReference } from '../ports/hour-entry-project-reader.port';
import { ListHourEntriesUseCase } from './list-hour-entries.use-case';

const EMPTY_PAGE: Page<HourEntryListItem> = { items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 };

class FakeEntryRepository implements HourEntryRepository {
  search = vi.fn().mockResolvedValue(EMPTY_PAGE);
  async findById(): Promise<null> {
    return null;
  }
  async findByLegacyId(): Promise<null> {
    return null;
  }
  async save(): Promise<void> {}
  async delete(): Promise<void> {}
  async sumApprovedHoursForProject(): Promise<number> {
    return 0;
  }
  async sumApprovedHoursForProjects(): Promise<number> {
    return 0;
  }
  async sumRegularHoursForUserAndDate(): Promise<number> {
    return 0;
  }
  async sumOvertimeHoursByUserForProjects(): Promise<never[]> {
    return [];
  }
  async sumOvertimeHoursByProjectAndUser(): Promise<never[]> {
    return [];
  }
}

class FakeProjectReader implements HourEntryProjectReader {
  constructor(private readonly projectsById: Map<string, HourEntryProjectReference> = new Map()) {}

  async findById(idOrSlug: string): Promise<HourEntryProjectReference | null> {
    return this.projectsById.get(idOrSlug) ?? null;
  }
  async findManyByIds(): Promise<[]> {
    return [];
  }
  async isProjectApprover(): Promise<boolean> {
    return false;
  }
  async findApprovers(): Promise<[]> {
    return [];
  }
  async findModuleById(): Promise<null> {
    return null;
  }
  async recalculateUsedHours(): Promise<void> {}
}

function baseQuery() {
  return { page: 1, pageSize: 25, sortField: 'date' as const, sortDirection: 'desc' as const };
}

/**
 * El alcance de `hours:read_team` pasa por `leaderScopeUserId` (por fila,
 * EXCLUYENTE), no por un `visibleToUserIds` plano — ver
 * `HourEntryFilters.leaderScopeUserId` / DECISION-M4-HORAS.md "Cuarta
 * corrección". Liderar "Desarrollo" en el Proyecto A no debe hacer visibles
 * las horas de "Desarrollo" en el Proyecto B, donde lidera otra persona.
 */
describe('ListHourEntriesUseCase — alcance de visibilidad', () => {
  it('hours:read_all sin userId en la query: sin restricción', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    await useCase.execute({ query: baseQuery(), actor: { userId: 'admin-1', email: 'a@kabeli.cl' }, actorPermissions: ['hours:read_all'] });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.visibleToUserIds).toBeUndefined();
    expect(filters.leaderScopeUserId).toBeUndefined();
    expect(filters.userId).toBeUndefined();
  });

  it('hours:read_all con userId en la query: acota a ese usuario', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    await useCase.execute({
      query: { ...baseQuery(), userId: 'someone-1' },
      actor: { userId: 'admin-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_all'],
    });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.visibleToUserIds).toEqual(['someone-1']);
  });

  it('hours:read_team: usa leaderScopeUserId (por fila), NO un set plano de ids', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    await useCase.execute({ query: baseQuery(), actor: { userId: 'leader-1', email: 'l@kabeli.cl' }, actorPermissions: ['hours:read_team'] });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.leaderScopeUserId).toBe('leader-1');
    expect(filters.visibleToUserIds).toBeUndefined();
  });

  it('hours:read_team con userId en la query: lo pasa como filtro exacto, sigue acotado por leaderScopeUserId', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    await useCase.execute({
      query: { ...baseQuery(), userId: 'collaborator-1' },
      actor: { userId: 'leader-1', email: 'l@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.userId).toBe('collaborator-1');
    expect(filters.leaderScopeUserId).toBe('leader-1');
  });

  it('sin hours:read_all ni hours:read_team: solo lo propio, ignora userId de la query', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    await useCase.execute({
      query: { ...baseQuery(), userId: 'someone-else' },
      actor: { userId: 'collaborator-1', email: 'c@kabeli.cl' },
      actorPermissions: ['hours:read_own'],
    });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.visibleToUserIds).toEqual(['collaborator-1']);
    expect(filters.userId).toBeUndefined();
    expect(filters.leaderScopeUserId).toBeUndefined();
  });
});

/**
 * `projectId` llega desde la URL como slug (ficha de proyecto), no como
 * UUID — contra Postgres real esto revienta con "invalid input syntax for
 * type uuid" (columna `hour_entries.project_id`) si se filtra con el slug
 * crudo.
 */
describe('ListHourEntriesUseCase — resolución de slug en projectId', () => {
  const PROJECT_REF: HourEntryProjectReference = {
    id: 'project-uuid-1',
    name: 'Portal de Gestión Financiera',
    status: 'active',
    leaderUserId: null,
    allowsOvertime: false,
  };

  it('resuelve projectId de slug a UUID antes de filtrar', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader(new Map([['portal-de-gestion-financiera', PROJECT_REF]])));

    await useCase.execute({
      query: { ...baseQuery(), projectId: 'portal-de-gestion-financiera' },
      actor: { userId: 'admin-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_all'],
    });

    const filters: HourEntryFilters = repo.search.mock.calls[0]![0];
    expect(filters.projectId).toBe('project-uuid-1');
  });

  it('projectId que no resuelve a ningún proyecto: página vacía sin consultar hour_entries', async () => {
    const repo = new FakeEntryRepository();
    const useCase = new ListHourEntriesUseCase(repo, new FakeProjectReader());

    const result = await useCase.execute({
      query: { ...baseQuery(), projectId: 'no-existe' },
      actor: { userId: 'admin-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_all'],
    });

    expect(result.isOk() && result.value.items).toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });
});
