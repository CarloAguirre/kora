import { describe, expect, it } from 'vitest';
import { CreateTicketHhRequestUseCase, splitByDailyCap } from './create-ticket-hh-request.use-case';
import { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketHhRequest } from '../../domain/entities/ticket-hh-request.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type { TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import type { TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { HourEntry } from '../../../hours/domain/entities/hour-entry.entity';
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
  readonly saved: TicketHhRequest[] = [];
  async save(request: TicketHhRequest): Promise<void> {
    this.saved.push(request);
  }
}

class StubHourEntryRepository implements Partial<HourEntryRepository> {
  readonly saved: HourEntry[] = [];
  constructor(private readonly regularHoursForUser: number = 0) {}
  async sumRegularHoursForUserAndDate(): Promise<number> {
    return this.regularHoursForUser;
  }
  async save(entry: HourEntry): Promise<void> {
    this.saved.push(entry);
  }
}

function buildTicket(): Ticket {
  return Ticket.create({
    id: 'ticket-1',
    title: 'Contingencia Casa Andina',
    projectId: 'project-1',
    assigneeUserId: ACTOR.userId,
    now: NOW,
  }).unwrap();
}

function buildUseCase(options: { regularHours?: number } = {}) {
  const requests = new StubTicketHhRequestRepository();
  const hourEntries = new StubHourEntryRepository(options.regularHours ?? 0);
  const useCase = new CreateTicketHhRequestUseCase(
    new StubTicketRepository(buildTicket()) as unknown as TicketRepository,
    { append: async () => {} } as unknown as TicketHistoryRepository,
    requests as unknown as TicketHhRequestRepository,
    new StubTicketProjectReader() as unknown as TicketProjectReader,
    hourEntries as unknown as HourEntryRepository,
    new RecordingAuditRecorder(),
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { useCase, requests, hourEntries };
}

const tranchesOf = (requests: StubTicketHhRequestRepository) =>
  requests.saved.map((request) => ({ hours: request.hours, isOvertime: request.isOvertime }));

describe('splitByDailyCap', () => {
  it('deja todo como horas normales mientras quepa en la jornada de 8h', () => {
    expect(splitByDailyCap(4, 3)).toEqual([{ hours: 4, isOvertime: false }]);
  });

  it('separa el excedente de 8h como horas extra', () => {
    expect(splitByDailyCap(4, 5)).toEqual([
      { hours: 3, isOvertime: false },
      { hours: 1, isOvertime: true },
    ]);
  });

  it('marca todo como horas extra si la jornada ya está completa', () => {
    expect(splitByDailyCap(2.5, 8)).toEqual([{ hours: 2.5, isOvertime: true }]);
  });
});

describe('CreateTicketHhRequestUseCase — horas extra automáticas sobre 8h', () => {
  it('acepta una solicitud que por sí sola supera las 8h, separando 8h normales y el resto como horas extra', async () => {
    const { useCase, requests, hourEntries } = buildUseCase();

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 10 },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
    expect(tranchesOf(requests)).toEqual([
      { hours: 8, isOvertime: false },
      { hours: 2, isOvertime: true },
    ]);
    expect(hourEntries.saved.map((entry) => entry.isOvertime)).toEqual([false, true]);
    expect(requests.saved.every((request) => request.status === 'pending')).toBe(true);
  });

  it('cuenta las horas normales ya registradas ese día en otro proceso (incluida una solicitud pendiente de OTRO ticket)', async () => {
    const { useCase, requests } = buildUseCase({ regularHours: 5 });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 4 },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
    expect(tranchesOf(requests)).toEqual([
      { hours: 3, isOvertime: false },
      { hours: 1, isOvertime: true },
    ]);
  });

  it('no genera horas extra si la solicitud cabe en la jornada', async () => {
    const { useCase, requests } = buildUseCase({ regularHours: 3 });

    const result = await useCase.execute({
      ticketId: 'ticket-1',
      data: { date: '2026-09-10', hours: 4 },
      actor: ACTOR,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
    expect(tranchesOf(requests)).toEqual([{ hours: 4, isOvertime: false }]);
  });
});
