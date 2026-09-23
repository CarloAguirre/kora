import { describe, expect, it, vi } from 'vitest';
import { GetTicketUseCase } from './get-ticket.use-case';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type { TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import type { TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import type { TicketClientReader } from '../ports/ticket-client-reader.port';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { TicketUserReader } from '../ports/ticket-user-reader.port';

class FakeTicketRepository implements Partial<TicketRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findByLegacyId = vi.fn().mockResolvedValue(null);
}

const NEVER_USED = {} as never;

function buildUseCase(tickets: FakeTicketRepository) {
  return new GetTicketUseCase(
    tickets as unknown as TicketRepository,
    NEVER_USED as TicketHistoryRepository,
    NEVER_USED as TicketHhRequestRepository,
    NEVER_USED as TicketClientReader,
    NEVER_USED as TicketProjectReader,
    NEVER_USED as TicketUserReader,
  );
}

/** `GET /tickets/:id` acepta UUID o el código visible (`TK-0001`). */
describe('GetTicketUseCase — resolución por id o código', () => {
  it('con un UUID, busca por id y no por código', async () => {
    const tickets = new FakeTicketRepository();
    const useCase = buildUseCase(tickets);

    await useCase.execute({ ticketId: '11111111-1111-4111-8111-111111111111', actorUserId: 'u1', actorRole: 'admin', actorPermissions: ['tickets:read'] });

    expect(tickets.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(tickets.findByLegacyId).not.toHaveBeenCalled();
  });

  it('con un código (TK-0001), busca por código y no por id', async () => {
    const tickets = new FakeTicketRepository();
    const useCase = buildUseCase(tickets);

    await useCase.execute({ ticketId: 'TK-0001', actorUserId: 'u1', actorRole: 'admin', actorPermissions: ['tickets:read'] });

    expect(tickets.findByLegacyId).toHaveBeenCalledWith('TK-0001');
    expect(tickets.findById).not.toHaveBeenCalled();
  });
});
