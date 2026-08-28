import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeClientStatusUseCase } from './change-client-status.use-case';
import { Client } from '../../domain/entities/client.entity';
import { TaxId } from '../../domain/value-objects/tax-id.vo';
import type { ClientRepository } from '../../domain/repositories/client.repository';
import type { ProjectActivityReader } from '../ports/project-activity-reader.port';
import {
  FixedClock,
  PassthroughUnitOfWork,
  RecordingAuditRecorder,
} from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';

const ACTOR: ActorContext = { userId: 'admin-1', email: 'admin@kabeli.cl' };
const NOW = new Date('2026-08-25T12:00:00.000Z');

class InMemoryClientRepository implements Partial<ClientRepository> {
  private readonly clients = new Map<string, Client>();

  seed(client: Client): this {
    this.clients.set(client.id, client);
    return this;
  }

  async findById(id: string): Promise<Client | null> {
    return this.clients.get(id) ?? null;
  }

  async save(client: Client): Promise<void> {
    this.clients.set(client.id, client);
  }
}

class StubProjectActivityReader implements ProjectActivityReader {
  constructor(private readonly count: number) {}

  async countActiveProjectsForClient(): Promise<number> {
    return this.count;
  }
}

function buildClient(): Client {
  return Client.create({
    id: 'client-1',
    companyName: 'Acme SpA',
    legalName: 'Acme',
    taxId: TaxId.create('76.123.456-7').unwrap(),
    now: NOW,
  });
}

describe('ChangeClientStatusUseCase', () => {
  let clients: InMemoryClientRepository;
  let audit: RecordingAuditRecorder;

  beforeEach(() => {
    clients = new InMemoryClientRepository();
    audit = new RecordingAuditRecorder();
  });

  function buildUseCase(activeProjects: number): ChangeClientStatusUseCase {
    return new ChangeClientStatusUseCase(
      clients as unknown as ClientRepository,
      new StubProjectActivityReader(activeProjects),
      audit,
      new PassthroughUnitOfWork(),
      new FixedClock(NOW),
    );
  }

  it('desactiva sin pedir confirmación cuando no hay proyectos activos', async () => {
    clients.seed(buildClient());
    const useCase = buildUseCase(0);

    const result = await useCase.execute({
      clientId: 'client-1',
      data: { status: 'inactive', confirmProjectCascade: false },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect((await clients.findById('client-1'))?.status).toBe('inactive');
  });

  it('rechaza la desactivación si hay proyectos activos y no se confirmó', async () => {
    // Es la regla que en la v1 no existía: el trigger finalizaba los proyectos
    // sin que nadie lo confirmara desde la interfaz.
    clients.seed(buildClient());
    const useCase = buildUseCase(3);

    const result = await useCase.execute({
      clientId: 'client-1',
      data: { status: 'inactive', confirmProjectCascade: false },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CLIENT_DEACTIVATION_REQUIRES_CONFIRMATION');
      expect(result.error.details?.activeProjectCount).toBe(3);
    }
    expect((await clients.findById('client-1'))?.status).toBe('active');
  });

  it('desactiva si hay proyectos activos pero el llamador confirmó', async () => {
    clients.seed(buildClient());
    const useCase = buildUseCase(3);

    const result = await useCase.execute({
      clientId: 'client-1',
      data: { status: 'inactive', confirmProjectCascade: true },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect((await clients.findById('client-1'))?.status).toBe('inactive');
  });

  it('activar nunca pide confirmación', async () => {
    const client = buildClient();
    client.deactivate(NOW);
    clients.seed(client);
    const useCase = buildUseCase(5);

    const result = await useCase.execute({
      clientId: 'client-1',
      data: { status: 'active', confirmProjectCascade: false },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
  });

  it('no hace nada si el estado ya es el pedido', async () => {
    clients.seed(buildClient());
    const useCase = buildUseCase(0);

    await useCase.execute({
      clientId: 'client-1',
      data: { status: 'active', confirmProjectCascade: false },
      actor: ACTOR,
    });

    expect(audit.entries).toHaveLength(0);
  });

  it('registra el número de proyectos afectados en la auditoría', async () => {
    clients.seed(buildClient());
    const useCase = buildUseCase(3);

    await useCase.execute({
      clientId: 'client-1',
      data: { status: 'inactive', confirmProjectCascade: true },
      actor: ACTOR,
    });

    expect(audit.entries[0]?.metadata?.affectedProjects).toBe(3);
    expect(audit.entries[0]?.changes?.status).toEqual({ before: 'active', after: 'inactive' });
  });

  it('devuelve error si el cliente no existe', async () => {
    const useCase = buildUseCase(0);

    const result = await useCase.execute({
      clientId: 'no-existe',
      data: { status: 'inactive', confirmProjectCascade: false },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('CLIENT_NOT_FOUND');
  });
});
