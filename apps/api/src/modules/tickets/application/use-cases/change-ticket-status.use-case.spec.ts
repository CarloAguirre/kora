import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeTicketStatusUseCase } from './change-ticket-status.use-case';
import { Ticket } from '../../domain/entities/ticket.entity';
import { TicketHhRequest } from '../../domain/entities/ticket-hh-request.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type {
  AppendTicketHistoryEntry,
  TicketHistoryEntryRecord,
  TicketHistoryRepository,
} from '../../domain/repositories/ticket-history.repository';
import type { TicketHhRequestListItem, TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { FixedClock, RecordingAuditRecorder } from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';

const ACTOR: ActorContext = { userId: 'user-1', email: 'user@kabeli.cl' };
const NOW = new Date('2026-08-25T12:00:00.000Z');

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

class StubTicketHhRequestRepository implements Partial<TicketHhRequestRepository> {
  constructor(private readonly items: TicketHhRequestListItem[] = []) {}

  async listForTicket(): Promise<TicketHhRequestListItem[]> {
    return this.items;
  }
}

function buildTicket(overrides: Partial<Parameters<typeof Ticket.create>[0]> & { resolution?: string } = {}): Ticket {
  const { resolution, ...createOverrides } = overrides;
  const ticket = Ticket.create({ id: 'ticket-1', title: 'Falla en login', now: NOW, ...createOverrides }).unwrap();
  if (resolution !== undefined) ticket.updateDetails({ resolution }, NOW);
  return ticket;
}

function pendingHhRequest(): TicketHhRequestListItem {
  return TicketHhRequest.create({
    id: 'hh-1',
    ticketId: 'ticket-1',
    projectId: 'project-1',
    userId: 'user-2',
    date: NOW,
    hours: 2,
    now: NOW,
  })
    .unwrap()
    .toSnapshot() as unknown as TicketHhRequestListItem;
}

describe('ChangeTicketStatusUseCase — flujo forzado (ver docs/DECISION-M5-TICKETS.md)', () => {
  let tickets: InMemoryTicketRepository;
  let history: RecordingTicketHistoryRepository;
  let audit: RecordingAuditRecorder;

  beforeEach(() => {
    tickets = new InMemoryTicketRepository();
    history = new RecordingTicketHistoryRepository();
    audit = new RecordingAuditRecorder();
  });

  function buildUseCase(hhRequests: TicketHhRequestListItem[] = []): ChangeTicketStatusUseCase {
    return new ChangeTicketStatusUseCase(
      tickets as unknown as TicketRepository,
      history,
      new StubTicketHhRequestRepository(hhRequests) as unknown as TicketHhRequestRepository,
      audit,
      new FixedClock(NOW),
    );
  }

  it('rechaza avanzar sin responsable asignado', async () => {
    tickets.seed(buildTicket());
    const useCase = buildUseCase();

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_REQUIRES_ASSIGNEE');
  });

  it('un incidente no puede saltar a "En Pruebas"', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2', serviceType: 'incident' }));
    const useCase = buildUseCase();
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_testing' }, actor: ACTOR });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_INVALID_STATUS_TRANSITION');
  });

  it('rechaza saltar directo de "Pendiente" a "Terminado"', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2' }));
    const useCase = buildUseCase();

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_INVALID_STATUS_TRANSITION');
  });

  it('rechaza marcar "Terminado" sin solución registrada', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2' }));
    const useCase = buildUseCase();
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_RESOLUTION_REQUIRED');
  });

  it('permite marcar "Terminado" cuando hay solución registrada', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2', resolution: 'Se reinició el servicio.' }));
    const useCase = buildUseCase();
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });

    expect(result.isOk()).toBe(true);
  });

  it('rechaza cerrar con una solicitud de HH pendiente', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2', resolution: 'Listo.' }));
    const useCase = buildUseCase([pendingHhRequest()]);
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'closed' }, actor: ACTOR });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TICKET_HAS_PENDING_HH_REQUESTS');
  });

  it('reabrir (retroceder desde Terminado) no exige nada', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2', resolution: 'Listo.' }));
    const useCase = buildUseCase();
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });

    const result = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(history.entries.at(-1)?.eventType).toBe('ticket_reopened');
  });

  it('una mejora sí debe pasar por "En Pruebas"', async () => {
    tickets.seed(buildTicket({ assigneeUserId: 'user-2', serviceType: 'improvement' }));
    const useCase = buildUseCase();
    await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_progress' }, actor: ACTOR });

    const skipTesting = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'done' }, actor: ACTOR });
    expect(skipTesting.isErr()).toBe(true);

    const throughTesting = await useCase.execute({ ticketId: 'ticket-1', data: { status: 'in_testing' }, actor: ACTOR });
    expect(throughTesting.isOk()).toBe(true);
  });
});
