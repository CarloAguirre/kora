import { beforeEach, describe, expect, it } from 'vitest';
import type { RoleCode } from '@kora/contracts';
import { DeleteTicketUseCase } from './delete-ticket.use-case';
import { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type {
  AppendTicketHistoryEntry,
  TicketHistoryEntryRecord,
  TicketHistoryRepository,
} from '../../domain/repositories/ticket-history.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import { FixedClock, RecordingAuditRecorder } from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';

const ACTOR: ActorContext = { userId: 'user-1', email: 'user@kabeli.cl' };
const NOW = new Date('2026-10-20T12:00:00.000Z');

class StubTicketProjectReader implements Partial<TicketProjectReader> {
  constructor(private readonly approver: boolean) {}

  async isProjectApprover(): Promise<boolean> {
    return this.approver;
  }
}

class InMemoryTicketRepository implements Partial<TicketRepository> {
  private readonly tickets = new Map<string, Ticket>();

  seed(ticket: Ticket): this {
    this.tickets.set(ticket.id, ticket);
    return this;
  }

  async findById(id: string): Promise<Ticket | null> {
    return this.tickets.get(id) ?? null;
  }

  async save(ticket: Ticket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
  }
}

class RecordingTicketHistoryRepository implements TicketHistoryRepository {
  readonly entries: AppendTicketHistoryEntry[] = [];

  async append(entry: AppendTicketHistoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async listForTicket(): Promise<TicketHistoryEntryRecord[]> {
    return [];
  }
}

function buildTicket(status: 'pending' | 'closed'): Ticket {
  const ticket = Ticket.create({
    id: 'ticket-1',
    title: 'Falla en login',
    projectId: 'project-1',
    assigneeUserId: ACTOR.userId,
    now: NOW,
  }).unwrap();
  if (status === 'closed') ticket.changeStatus('closed', NOW);
  return ticket;
}

describe('DeleteTicketUseCase — ticket cerrado', () => {
  let tickets: InMemoryTicketRepository;
  let history: RecordingTicketHistoryRepository;

  beforeEach(() => {
    tickets = new InMemoryTicketRepository();
    history = new RecordingTicketHistoryRepository();
  });

  function buildUseCase(approver = false): DeleteTicketUseCase {
    return new DeleteTicketUseCase(
      tickets as unknown as TicketRepository,
      history,
      new StubTicketProjectReader(approver) as unknown as TicketProjectReader,
      new RecordingAuditRecorder(),
      new FixedClock(NOW),
    );
  }

  it.each<RoleCode>(['admin', 'pmo'])('%s puede eliminar un ticket cerrado', async (role) => {
    tickets.seed(buildTicket('closed'));

    const result = await buildUseCase().execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: role });

    expect(result.isOk()).toBe(true);
    expect((await tickets.findById('ticket-1'))?.isDeleted).toBe(true);
    expect(history.entries.map((entry) => entry.eventType)).toEqual(['ticket_deleted']);
  });

  it('el responsable/líder del proyecto no puede eliminar un ticket cerrado', async () => {
    tickets.seed(buildTicket('closed'));

    const result = await buildUseCase(true).execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_CANNOT_DELETE_CLOSED');
    expect((await tickets.findById('ticket-1'))?.isDeleted).toBe(false);
  });

  it('el responsable sí puede eliminar un ticket abierto', async () => {
    tickets.seed(buildTicket('pending'));

    const result = await buildUseCase().execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isOk()).toBe(true);
  });
});
