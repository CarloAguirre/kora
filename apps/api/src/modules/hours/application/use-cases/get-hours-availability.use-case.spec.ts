import { describe, expect, it } from 'vitest';
import type { RoleCode } from '@kora/contracts';
import { GetHoursAvailabilityUseCase } from './get-hours-availability.use-case';
import { InMemoryHourEntryRepository } from '../../../../test/fakes/in-memory-hour-entry.repository';
import { InMemoryUserRepository } from '../../../../test/fakes/in-memory-user.repository';
import { FakePermissionReader } from '../../../../test/fakes';
import type { HourEntryListItem } from '../../domain/repositories/hour-entry.repository';
import { User } from '../../../users/domain/entities/user.entity';
import { Email } from '../../../users/domain/value-objects/email.vo';
import { PersonName } from '../../../users/domain/value-objects/person-name.vo';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildUser(id: string, role: RoleCode, firstName = 'Nombre'): User {
  return User.create({
    id,
    email: Email.create(`${id}@kabeli.cl`).unwrap(),
    name: PersonName.create(firstName, 'Apellido').unwrap(),
    role,
    teamId: null,
    now: NOW,
  });
}

function buildEntry(overrides: Partial<HourEntryListItem>): HourEntryListItem {
  return {
    id: 'entry-1',
    userId: 'user-1',
    userFullName: 'Nombre Apellido',
    projectId: null,
    projectName: null,
    moduleId: null,
    moduleName: null,
    teamId: null,
    teamName: null,
    assignment: 'Proyecto',
    category: '',
    description: '',
    hours: 8,
    date: new Date('2026-08-10T00:00:00.000Z'),
    isOvertime: false,
    projectStageAtEntry: null,
    status: 'approved',
    rejectionReason: null,
    hasBlocker: false,
    blockerDescription: null,
    designatedApproverUserId: null,
    designatedApproverFullName: null,
    projectApprovers: [],
    ticket: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    decisionUserId: null,
    decisionByFullName: null,
    clientId: null,
    clientName: null,
    projectType: null,
    projectSalesStage: null,
    ...overrides,
  };
}

describe('GetHoursAvailabilityUseCase', () => {
  it('excluye roles que no pueden registrar horas, aunque estén habilitados', async () => {
    const users = new InMemoryUserRepository().seed(
      buildUser('collab-1', 'collaborator'),
      buildUser('commercial-1', 'commercial'),
    );
    const entries = new InMemoryHourEntryRepository();
    const permissions = new FakePermissionReader();
    const useCase = new GetHoursAvailabilityUseCase(users, entries, permissions);

    const result = await useCase.execute({
      query: { dateFrom: '2026-08-10', dateTo: '2026-08-14' },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.users.map((u) => u.userId)).toEqual(['collab-1']);
  });

  it('excluye usuarios disabled y conserva sus registros históricos fuera de la disponibilidad', async () => {
    const active = buildUser('active-1', 'collaborator', 'Activo');
    const disabled = buildUser('disabled-1', 'collaborator', 'Julio');
    expect(disabled.changeStatus('disabled', 'admin-id', NOW).isOk()).toBe(true);
    const users = new InMemoryUserRepository().seed(active, disabled);
    const entries = new InMemoryHourEntryRepository().seed(
      buildEntry({ id: 'historic-1', userId: disabled.id, status: 'approved', hours: 8 }),
      buildEntry({ id: 'current-1', userId: active.id, status: 'approved', hours: 5 }),
    );
    const result = await new GetHoursAvailabilityUseCase(
      users, entries, new FakePermissionReader(),
    ).execute({ query: { dateFrom: '2026-08-10', dateTo: '2026-08-10' } });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.users.map((item) => item.userId)).toEqual([active.id]);
    expect(result.value.hoursByUserAndDate[`${disabled.id}:2026-08-10`]).toBeUndefined();
    expect(result.value.registeredHoursByUserAndDate[`${disabled.id}:2026-08-10`]).toBeUndefined();
    expect(result.value.hoursByUserAndDate[`${active.id}:2026-08-10`]).toBe(5);
    // La consulta de disponibilidad no modifica ni elimina las horas ya registradas.
    expect((await entries.search(
      { status: 'approved', dateFrom: new Date('2026-08-10T00:00:00.000Z'),
        dateTo: new Date('2026-08-10T00:00:00.000Z') },
      { page: 1, pageSize: 10 }, { field: 'date', direction: 'asc' },
    )).items.some((item) => item.userId === disabled.id)).toBe(true);
  });

  it('filtra por rol solicitado además del filtro implícito de "puede registrar horas"', async () => {
    const users = new InMemoryUserRepository().seed(
      buildUser('collab-1', 'collaborator'),
      buildUser('leader-1', 'leader'),
    );
    const useCase = new GetHoursAvailabilityUseCase(
      users,
      new InMemoryHourEntryRepository(),
      new FakePermissionReader(),
    );

    const result = await useCase.execute({
      query: { dateFrom: '2026-08-10', dateTo: '2026-08-14', role: 'leader' },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.users.map((u) => u.userId)).toEqual(['leader-1']);
  });

  it('separa horas aprobadas (para el color) de horas registradas (aprobadas+pendientes, para la alerta)', async () => {
    const users = new InMemoryUserRepository().seed(buildUser('collab-1', 'collaborator'));
    const entries = new InMemoryHourEntryRepository().seed(
      buildEntry({ id: 'e1', userId: 'collab-1', status: 'approved', hours: 5, date: new Date('2026-08-10T00:00:00.000Z') }),
      buildEntry({ id: 'e2', userId: 'collab-1', status: 'pending', hours: 3, date: new Date('2026-08-10T00:00:00.000Z') }),
    );
    const useCase = new GetHoursAvailabilityUseCase(users, entries, new FakePermissionReader());

    const result = await useCase.execute({
      query: { dateFrom: '2026-08-10', dateTo: '2026-08-10' },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.hoursByUserAndDate['collab-1:2026-08-10']).toBe(5);
    expect(result.value.registeredHoursByUserAndDate['collab-1:2026-08-10']).toBe(8);
  });

  it('no cuenta horas de usuarios que quedaron fuera del filtro de disponibilidad', async () => {
    const users = new InMemoryUserRepository().seed(buildUser('commercial-1', 'commercial'));
    const entries = new InMemoryHourEntryRepository().seed(
      buildEntry({ id: 'e1', userId: 'commercial-1', status: 'approved', hours: 8 }),
    );
    const useCase = new GetHoursAvailabilityUseCase(users, entries, new FakePermissionReader());

    const result = await useCase.execute({
      query: { dateFrom: '2026-08-10', dateTo: '2026-08-10' },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.users).toHaveLength(0);
    expect(Object.keys(result.value.hoursByUserAndDate)).toHaveLength(0);
  });
});
