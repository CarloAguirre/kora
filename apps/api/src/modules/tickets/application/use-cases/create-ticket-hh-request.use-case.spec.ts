import { describe, expect, it } from 'vitest';
import { CreateTicketHhRequestUseCase } from './create-ticket-hh-request.use-case';
import { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type { TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import type { TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { FixedClock, RecordingAuditRecorder, SequentialIdGenerator } from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';

const ACTOR: ActorContext = { userId: 'collaborator-1', email: 'collab@kabeli.cl' };
const NOW = new Date('2026-09-10T12:00:00.000Z');

class StubTicketRepository implements Partial<TicketRepository> {
  constructor(private readonly ticket: Ticket) {}
  async findById(): Promise<Ticket | null> {
    return this.ticket;
  }
  async save(): Promise<void> {}
}

class StubTicketProjectReader implements Partial<TicketProjectReader> {
  async isProjectApprover(): Promise<boolean> {
    return false;
  }
}

class StubTicketHhRequestRepository implements Partial<TicketHhRequestRepository> {
  async save(): Promise<void> {}
}

class StubHourEntryRepository implements Partial<HourEntryRepository> {
  constructor(private readonly otherHoursForUser: number = 0) {}
  async sumHoursForUserAndDate(): Promise<number> {
    return this.otherHoursForUser;
  }
  async save(): Promise<void> {}
}

function buildTicket(allowsOvertime = false): Ticket {
  const ticket = Ticket.create({
    id: 'ticket-1',
    title: 'Contingencia Casa Andina',
    projectId: 'project-1',
    assigneeUserId: ACTOR.userId,
    now: NOW,
  }).unwrap();
  if (allowsOvertime) ticket.updateDetails({ allowsOvertime: true }, NOW);
  return ticket;
}

function buildUseCase(options: { otherHours?: number; allowsOvertime?: boolean } = {}): CreateTicketHhRequestUseCase {
  return new CreateTicketHhRequestUseCase(
    new StubTicketRepository(buildTicket(options.allowsOvertime ?? false)) as unknown as TicketRepository,
    { append: async () => {} } as unknown as TicketHistoryRepository,
    new StubTicketHhRequestRepository() as unknown as TicketHhRequestRepository,
    new StubTicketProjectReader() as unknown as TicketProjectReader,
    new StubHourEntryRepository(options.otherHours ?? 0) as unknown as HourEntryRepository,
    new RecordingAuditRecorder(),
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
}

describe('CreateTicketHhRequestUseCase — tope diario de 8h', () => {
  it('rechaza una solicitud que por sí sola supera las 8h sin marcar horas extra', async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 9, isOvertime: false },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isErr() && result.error.code).toBe('TICKET_HH_REQUEST_DAILY_CAP_EXCEEDED');
  });

  it('rechaza cuando, sumada a horas ya registradas en otro proceso (incluida una solicitud pendiente de OTRO ticket, que ya vive como hour_entries pendiente), supera las 8h', async () => {
    const useCase = buildUseCase({ otherHours: 5 });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 4, isOvertime: false },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isErr() && result.error.code).toBe('TICKET_HH_REQUEST_DAILY_CAP_EXCEEDED');
  });

  it('acepta superar las 8h cuando se marca como horas extra', async () => {
    const useCase = buildUseCase({ otherHours: 5, allowsOvertime: true });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 4, isOvertime: true },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
  });

  it('acepta una solicitud que no supera las 8h', async () => {
    const useCase = buildUseCase({ otherHours: 3 });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 4, isOvertime: false },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
  });
});
