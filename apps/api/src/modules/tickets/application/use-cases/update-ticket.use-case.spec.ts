import { beforeEach, describe, expect, it } from 'vitest';
import type { Permission, RoleCode, UserStatus } from '@kora/contracts';
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
const NO_PERMISSIONS: Permission[] = [];
const NOW = new Date('2026-08-25T12:00:00.000Z');

class StubTicketProjectReader implements Partial<TicketProjectReader> {
  constructor(private readonly approverId: string | null = null) {}
  async isProjectApprover(_projectId: string, actorUserId: string): Promise<boolean> {
    return this.approverId === actorUserId;
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
  constructor(private readonly people: Readonly<Record<string, { status: UserStatus; role: RoleCode }>>) {}

  async findById(userId: string): Promise<TicketUserReference | null> {
    const person = this.people[userId];
    return person ? { id: userId, fullName: `Persona ${userId}`, ...person } : null;
  }
}

const PEOPLE: Readonly<Record<string, { status: UserStatus; role: RoleCode }>> = {
  'user-active': { status: 'active', role: 'collaborator' },
  'user-blocked': { status: 'blocked', role: 'collaborator' },
  'user-disabled': { status: 'disabled', role: 'collaborator' },
  'user-leader': { status: 'active', role: 'leader' },
  'user-commercial': { status: 'active', role: 'commercial' },
  'user-pmo': { status: 'active', role: 'pmo' },
  'user-admin': { status: 'active', role: 'admin' },
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
      actorRole: 'admin',
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

  it('acepta a un líder', async () => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: 'user-leader' });

    expect(result.isOk()).toBe(true);
  });

  it.each(['user-commercial', 'user-pmo', 'user-admin'])('rechaza a %s: solo líderes y colaboradores atienden tickets', async (userId) => {
    tickets.seed(buildTicket());

    const result = await update({ assigneeUserId: userId });

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

describe('UpdateTicketUseCase — el simple responsable no edita el ticket', () => {
  const COLLABORATOR: ActorContext = { userId: 'collaborator-1', email: 'collab@kabeli.cl' };

  function buildTicket(): Ticket {
    return Ticket.create({
      id: 'ticket-1',
      title: 'Falla en login',
      assigneeUserId: COLLABORATOR.userId,
      projectId: 'project-1',
      now: NOW,
    }).unwrap();
  }

  it('rechaza que el responsable sin autoridad sobre el proyecto edite el título', async () => {
    const tickets = new InMemoryTicketRepository();
    tickets.seed(buildTicket());
    const useCase = new UpdateTicketUseCase(
      tickets as unknown as TicketRepository,
      new RecordingTicketHistoryRepository(),
      new StubTicketProjectReader(null) as unknown as TicketProjectReader,
      new StubTicketUserReader(PEOPLE),
      new RecordingAuditRecorder(),
      new FixedClock(NOW),
    );

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { title: 'Otro título' },
      actor: COLLABORATOR,
      actorRole: 'collaborator',
      actorPermissions: NO_PERMISSIONS,
    });

    expect(result.isErr() && result.error.code).toBe('TICKET_CANNOT_MANAGE');
  });

  it('permite que el responsable sin autoridad complete SU ticket con la solución', async () => {
    const tickets = new InMemoryTicketRepository();
    tickets.seed(buildTicket());
    const useCase = new UpdateTicketUseCase(
      tickets as unknown as TicketRepository,
      new RecordingTicketHistoryRepository(),
      new StubTicketProjectReader(null) as unknown as TicketProjectReader,
      new StubTicketUserReader(PEOPLE),
      new RecordingAuditRecorder(),
      new FixedClock(NOW),
    );

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { resolution: 'Se reinició la sesión.' },
      actor: COLLABORATOR,
      actorRole: 'collaborator',
      actorPermissions: NO_PERMISSIONS,
    });

    expect(result.isOk()).toBe(true);
    expect((await tickets.findById('ticket-1'))?.toSnapshot().resolution).toBe('Se reinició la sesión.');
  });

  it('permite editar el ticket a quien tiene autoridad sobre el proyecto', async () => {
    const tickets = new InMemoryTicketRepository();
    tickets.seed(buildTicket());
    const useCase = new UpdateTicketUseCase(
      tickets as unknown as TicketRepository,
      new RecordingTicketHistoryRepository(),
      new StubTicketProjectReader(COLLABORATOR.userId) as unknown as TicketProjectReader,
      new StubTicketUserReader(PEOPLE),
      new RecordingAuditRecorder(),
      new FixedClock(NOW),
    );

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { title: 'Otro título' },
      actor: COLLABORATOR,
      actorRole: 'collaborator',
      actorPermissions: NO_PERMISSIONS,
    });

    expect(result.isOk()).toBe(true);
  });
});
