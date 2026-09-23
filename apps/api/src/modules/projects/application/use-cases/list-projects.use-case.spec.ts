import { describe, expect, it, vi } from 'vitest';
import { buildPage, type Page } from '@kora/core';
import type { ListProjectsQuery, Permission } from '@kora/contracts';
import { ListProjectsUseCase } from './list-projects.use-case';
import type { ProjectFilters, ProjectListItem, ProjectRepository } from '../../domain/repositories/project.repository';
import type { TeamRepository } from '../../../teams/domain/repositories/team.repository';
import type { Team } from '../../../teams/domain/entities/team.entity';
import type { ProjectClientReader, ProjectClientReference } from '../ports/project-client-reader.port';

const EMPTY_PAGE: Page<ProjectListItem> = buildPage([], 0, { page: 1, pageSize: 25 });

class FakeProjectRepository implements Partial<ProjectRepository> {
  search = vi.fn().mockResolvedValue(EMPTY_PAGE);
}

class FakeTeamRepository implements Partial<TeamRepository> {
  constructor(private readonly teamsById: Map<string, { id: string }>) {}

  async findById(idOrSlug: string): Promise<Team | null> {
    const team = this.teamsById.get(idOrSlug);
    return team ? (team as Team) : null;
  }

  isLeaderOfTeam = vi.fn().mockResolvedValue(false);
  isTeamLeaderOfMember = vi.fn().mockResolvedValue(false);
}

class FakeClientReader implements ProjectClientReader {
  constructor(private readonly clientsById: Map<string, ProjectClientReference>) {}

  async findById(idOrSlug: string): Promise<ProjectClientReference | null> {
    return this.clientsById.get(idOrSlug) ?? null;
  }
}

const ACTOR = { userId: 'admin-1', email: 'admin@kabeli.cl' };
const FULL_READ: readonly Permission[] = ['projects:read'];

function baseQuery(): ListProjectsQuery {
  return { page: 1, pageSize: 25, sortField: 'priority', sortDirection: 'desc' };
}

/**
 * `clientId`/`teamId` llegan desde la URL como slug (ver `paths.ts` en el
 * frontend), no como UUID — estos tests existen porque un fake sin esta
 * resolución deja pasar en silencio lo que contra Postgres real revienta con
 * "invalid input syntax for type uuid" (columna `client_id`/`team_id`).
 */
describe('ListProjectsUseCase — resolución de slug en los filtros', () => {
  it('resuelve clientId de slug a UUID antes de filtrar', async () => {
    const projects = new FakeProjectRepository();
    const teams = new FakeTeamRepository(new Map());
    const clients = new FakeClientReader(new Map([['amicar', { id: 'client-uuid-1', companyName: 'Amicar' }]]));
    const useCase = new ListProjectsUseCase(
      projects as unknown as ProjectRepository,
      teams as unknown as TeamRepository,
      clients,
    );

    await useCase.execute({ query: { ...baseQuery(), clientId: 'amicar' }, actor: ACTOR, actorPermissions: FULL_READ });

    const filters: ProjectFilters = projects.search.mock.calls[0]![0];
    expect(filters.clientId).toBe('client-uuid-1');
  });

  it('clientId que no resuelve a ningún cliente: devuelve página vacía sin consultar projects.search', async () => {
    const projects = new FakeProjectRepository();
    const teams = new FakeTeamRepository(new Map());
    const clients = new FakeClientReader(new Map());
    const useCase = new ListProjectsUseCase(
      projects as unknown as ProjectRepository,
      teams as unknown as TeamRepository,
      clients,
    );

    const result = await useCase.execute({
      query: { ...baseQuery(), clientId: 'no-existe' },
      actor: ACTOR,
      actorPermissions: FULL_READ,
    });

    expect(result.isOk() && result.value.items).toEqual([]);
    expect(projects.search).not.toHaveBeenCalled();
  });

  it('resuelve teamId de slug a UUID antes de filtrar (actor con projects:read completo)', async () => {
    const projects = new FakeProjectRepository();
    const teams = new FakeTeamRepository(new Map([['desarrollo', { id: 'team-uuid-1' }]]));
    const clients = new FakeClientReader(new Map());
    const useCase = new ListProjectsUseCase(
      projects as unknown as ProjectRepository,
      teams as unknown as TeamRepository,
      clients,
    );

    await useCase.execute({ query: { ...baseQuery(), teamId: 'desarrollo' }, actor: ACTOR, actorPermissions: FULL_READ });

    const filters: ProjectFilters = projects.search.mock.calls[0]![0];
    expect(filters.teamId).toBe('team-uuid-1');
  });

  it('sin projects:read completo, valida liderazgo con el UUID ya resuelto, no con el slug crudo', async () => {
    const projects = new FakeProjectRepository();
    const teams = new FakeTeamRepository(new Map([['desarrollo', { id: 'team-uuid-1' }]]));
    teams.isLeaderOfTeam.mockResolvedValue(true);
    const clients = new FakeClientReader(new Map());
    const useCase = new ListProjectsUseCase(
      projects as unknown as ProjectRepository,
      teams as unknown as TeamRepository,
      clients,
    );

    await useCase.execute({
      query: { ...baseQuery(), teamId: 'desarrollo' },
      actor: { userId: 'leader-1', email: 'l@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    expect(teams.isLeaderOfTeam).toHaveBeenCalledWith('leader-1', 'team-uuid-1');
    const filters: ProjectFilters = projects.search.mock.calls[0]![0];
    expect(filters.teamId).toBe('team-uuid-1');
  });
});
