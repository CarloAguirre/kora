import { beforeEach, describe, expect, it } from 'vitest';
import type { Permission, UserStatus } from '@kora/contracts';
import { UpdateTicketUseCase } from './update-ticket.use-case';
import { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type {
  AppendTicketHistoryEntry,
  TicketHistoryEntryRecord,
  TicketHistoryRepository,
} from '../../domain/repositories/ticket-history.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { TicketUserReader, TicketUserReference } from '../ports/ticket-user-reader.port';
import { FixedClock, RecordingAuditRecorder } from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';

const ACTOR: ActorContext = { userId: 'user-1', email: 'user@kabeli.cl' };
const MANAGE_PERMISSIONS: Permission[] = ['tickets:manage'];
const NOW = new Date('2026-08-25T12:00:00.000Z');

class StubTicketProjectReader implements Partial<TicketProjectReader> {
  async isProjectApprover(): Promise<boolean> {
    return false;
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

/** `findById` devuelve `null` para los eliminados, igual que el lector real. */
class StubTicketUserReader implements TicketUserReader {
  constructor(private readonly people: Readonly<Record<string, UserStatus>>) {}

  async findById(userId: string): Promise<TicketUserReference | null> {
    const status = this.people[userId];
    return status ? { id: userId, fullName: `Persona ${userId}`, status } : null;
  }
}

const PEOPLE: Readonly<Record<string, UserStatus>> = {
  'user-active': 'active',
  'user-blocked': 'blocked',
  'user-disabled': 'disabled',
};

describe('UpdateTicketUseCase — responsable asignable', () => {
  let tickets: InMemoryTicketRepository;
  let history: RecordingTicketHistoryRepository;
  let useCase: UpdateTicketUseCase;

  function buildTicket(assigneeUserId: string | null = null): Ticket {
    return Ticket.create({ id: 'ticket-1', title: 'Falla en login', assigneeUserId, now: NOW }).unwrap();
  }

  function update(data: Parameters<UpdateTicketUseCase['execute']>[0]['data']) {
    return useCase.execute({
      ticketId: 'ticket-1',
      data,
      actor: ACTOR,
      actorPermissions: MANAGE_PERMISSIONS,
    });
  }

  beforeEach(() => {
    tickets = new InMemoryTicketRepository();
    history = new RecordingTicketHistoryRepository();
    useCase = new UpdateTicketUseCase(
      tickets as unknown as TicketRepository,
      history,
      new StubTicketProjectReader() as unknown as TicketProjectReader,
      new StubTicketUserReader(PEOPLE),
      new RecordingAuditRecorder(),
      new FixedClock(NOW),
    );
  });

  it('acepta a una persona vigente', async () => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: 'user-active' });

    expect(result.isOk()).toBe(true);
    expect((await tickets.findById('ticket-1'))?.assigneeUserId).toBe('user-active');
  });

  it('rechaza a una persona deshabilitada', async () => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: 'user-disabled' });

    expect(result.isErr() && result.error.code).toBe('TICKET_ASSIGNEE_NOT_ASSIGNABLE');
    expect((await tickets.findById('ticket-1'))?.assigneeUserId).toBeNull();
  });

  it('rechaza a una persona eliminada', async () => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: 'user-borrado' });

    expect(result.isErr() && result.error.code).toBe('TICKET_ASSIGNEE_NOT_ASSIGNABLE');
  });

  it('acepta a una persona bloqueada: el bloqueo es temporal y del sistema, no una baja', async () => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: 'user-blocked' });

    expect(result.isOk()).toBe(true);
  });

  /** Si no, editar el título de un ticket viejo fallaría por su responsable. */
  it('deja editar otros campos de un ticket cuyo responsable ya fue dado de baja', async () => {
    tickets.seed(buildTicket('user-disabled'));

    const result = await update({ title: 'Falla en login (SSO)', assigneeUserId: 'user-disabled' });

    expect(result.isOk()).toBe(true);
    expect((await tickets.findById('ticket-1'))?.toSnapshot().title).toBe('Falla en login (SSO)');
  });

  it('permite quitar al responsable dado de baja', async () => {
    tickets.seed(buildTicket('user-disabled'));

    const result = await update({ assigneeUserId: null });

    expect(result.isOk()).toBe(true);
    expect((await tickets.findById('ticket-1'))?.assigneeUserId).toBeNull();
  });
});
