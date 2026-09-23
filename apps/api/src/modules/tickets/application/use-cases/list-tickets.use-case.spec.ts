import { describe, expect, it, vi } from 'vitest';
import { buildPage, type Page } from '@kora/core';
import type { ListTicketsQuery } from '@kora/contracts';
import { ListTicketsUseCase } from './list-tickets.use-case';
import type { TicketFilters, TicketListItem, TicketRepository } from '../../domain/repositories/ticket.repository';
import type { TicketProjectReader, TicketProjectReference } from '../ports/ticket-project-reader.port';

const EMPTY_PAGE: Page<TicketListItem> = buildPage([], 0, { page: 1, pageSize: 25 });

class FakeTicketRepository implements Partial<TicketRepository> {
  search = vi.fn().mockResolvedValue(EMPTY_PAGE);
}

class FakeProjectReader implements Partial<TicketProjectReader> {
  constructor(private readonly projectsById: Map<string, TicketProjectReference>) {}

  async findById(idOrSlug: string): Promise<TicketProjectReference | null> {
    return this.projectsById.get(idOrSlug) ?? null;
  }
}

const ACTOR = { userId: 'admin-1', email: 'admin@kabeli.cl' };

function baseQuery(): ListTicketsQuery {
  return { page: 1, pageSize: 25, sortField: 'createdAt', sortDirection: 'desc' };
}

/**
 * `projectId` llega desde la URL como slug (ficha de proyecto de soporte),
 * no como UUID — contra Postgres real esto revienta con "invalid input
 * syntax for type uuid" (columna `tickets.project_id`); un fake sin esta
 * resolución no lo hubiera detectado nunca.
 */
describe('ListTicketsUseCase — resolución de slug en projectId', () => {
  it('resuelve projectId de slug a UUID antes de filtrar', async () => {
    const tickets = new FakeTicketRepository();
    const projects = new FakeProjectReader(
      new Map([['soporte-siegfried', { id: 'project-uuid-1', name: 'Soporte Siegfried', status: 'active', type: 'support', clientId: null }]]),
    );
    const useCase = new ListTicketsUseCase(tickets as unknown as TicketRepository, projects as unknown as TicketProjectReader);

    await useCase.execute({
      query: { ...baseQuery(), projectId: 'soporte-siegfried' },
      actor: ACTOR,
      actorPermissions: ['tickets:read'],
    });

    const filters: TicketFilters = tickets.search.mock.calls[0]![0];
    expect(filters.projectId).toBe('project-uuid-1');
  });

  it('projectId que no resuelve a ningún proyecto: devuelve página vacía sin consultar tickets.search', async () => {
    const tickets = new FakeTicketRepository();
    const projects = new FakeProjectReader(new Map());
    const useCase = new ListTicketsUseCase(tickets as unknown as TicketRepository, projects as unknown as TicketProjectReader);

    const result = await useCase.execute({
      query: { ...baseQuery(), projectId: 'no-existe' },
      actor: ACTOR,
      actorPermissions: ['tickets:read'],
    });

    expect(result.isOk() && result.value.items).toEqual([]);
    expect(tickets.search).not.toHaveBeenCalled();
  });
});
