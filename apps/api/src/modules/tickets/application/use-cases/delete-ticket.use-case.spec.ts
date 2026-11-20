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
import type { TicketHhRequestListItem, TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader } from '../../../hours/application/ports/hour-entry-project-reader.port';
import { FixedClock, PassthroughUnitOfWork, RecordingAuditRecorder } from '../../../../test/fakes';
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

class InMemoryTicketHhRequestRepository implements Partial<TicketHhRequestRepository> {
  items: TicketHhRequestListItem[] = [];

  async listForTicket(ticketId: string): Promise<TicketHhRequestListItem[]> {
    return this.items.filter((item) => item.ticketId === ticketId);
  }

  async deleteForTicket(ticketId: string): Promise<void> {
    this.items = this.items.filter((item) => item.ticketId !== ticketId);
  }
}

class RecordingHourEntryRepository implements Partial<HourEntryRepository> {
  readonly deleted: string[] = [];

  async delete(id: string): Promise<void> {
    this.deleted.push(id);
  }

  async sumApprovedHoursForProject(): Promise<number> {
    return 10;
  }
}

class RecordingHourEntryProjectReader implements Partial<HourEntryProjectReader> {
  readonly recalculated: { projectId: string; usedHours: number }[] = [];

  async recalculateUsedHours(projectId: string, usedHours: number): Promise<void> {
    this.recalculated.push({ projectId, usedHours });
  }
}

function buildRequest(id: string, status: TicketHhRequestListItem['status'], hours: number): TicketHhRequestListItem {
  return {
    id,
    ticketId: 'ticket-1',
    projectId: 'project-1',
    projectName: 'Soporte Amicar',
    userId: ACTOR.userId,
    userFullName: 'José Aponte',
    date: NOW,
    hours,
    note: null,
    isOvertime: false,
    status,
    rejectionReason: null,
    reviewedByUserId: null,
    reviewedByFullName: null,
    reviewedAt: null,
    hourEntryId: `entry-${id}`,
    createdAt: NOW,
  };
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

describe('DeleteTicketUseCase', () => {
  let tickets: InMemoryTicketRepository;
  let history: RecordingTicketHistoryRepository;
  let requests: InMemoryTicketHhRequestRepository;
  let hourEntries: RecordingHourEntryRepository;
  let hourProjects: RecordingHourEntryProjectReader;

  beforeEach(() => {
    tickets = new InMemoryTicketRepository();
    history = new RecordingTicketHistoryRepository();
    requests = new InMemoryTicketHhRequestRepository();
    hourEntries = new RecordingHourEntryRepository();
    hourProjects = new RecordingHourEntryProjectReader();
  });

  function buildUseCase(approver = false): DeleteTicketUseCase {
    return new DeleteTicketUseCase(
      tickets as unknown as TicketRepository,
      history,
      requests as unknown as TicketHhRequestRepository,
      new StubTicketProjectReader(approver) as unknown as TicketProjectReader,
      hourEntries as unknown as HourEntryRepository,
      hourProjects as unknown as HourEntryProjectReader,
      new RecordingAuditRecorder(),
      new PassthroughUnitOfWork(),
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

  it('borra las solicitudes de HH del ticket y sus horas, y recalcula el consumo si había aprobadas', async () => {
    tickets.seed(buildTicket('pending'));
    requests.items = [buildRequest('r1', 'approved', 3), buildRequest('r2', 'pending', 1.5)];

    const result = await buildUseCase(true).execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isOk()).toBe(true);
    expect(requests.items).toEqual([]);
    expect(hourEntries.deleted).toEqual(['entry-r1', 'entry-r2']);
    expect(hourProjects.recalculated).toEqual([{ projectId: 'project-1', usedHours: 10 }]);
    expect((await tickets.findById('ticket-1'))?.usedHours).toBe(0);
    expect(history.entries[0]?.description).toBe('Ticket eliminado, junto con sus 4.5 HH registradas.');
  });

  it('con solo HH pendientes, el responsable lo elimina y no se toca el consumo del proyecto', async () => {
    tickets.seed(buildTicket('pending'));
    requests.items = [buildRequest('r1', 'pending', 2)];

    const result = await buildUseCase().execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    expect(hourEntries.deleted).toEqual(['entry-r1']);
    expect(hourProjects.recalculated).toEqual([]);
  });

  it('el responsable sin autoridad sobre el proyecto no puede eliminar un ticket con HH aprobadas', async () => {
    tickets.seed(buildTicket('pending'));
    requests.items = [buildRequest('r1', 'approved', 3)];

    const result = await buildUseCase().execute({ ticketId: 'ticket-1', actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_CANNOT_DELETE_APPROVED_HOURS');
    expect(hourEntries.deleted).toEqual([]);
    expect((await tickets.findById('ticket-1'))?.isDeleted).toBe(false);
  });
});
