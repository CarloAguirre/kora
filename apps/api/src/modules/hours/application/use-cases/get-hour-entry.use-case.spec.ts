import { describe, expect, it } from 'vitest';
import type { HourEntry } from '../../domain/entities/hour-entry.entity';
import { HourEntry as HourEntryEntity } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReader, HourEntryUserReference } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import { GetHourEntryUseCase } from './get-hour-entry.use-case';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildEntry(userId: string): HourEntry {
  return HourEntryEntity.create({
    id: 'entry-1',
    userId,
    assignment: 'Proyecto',
    projectId: 'project-1',
    hours: 4,
    date: new Date('2026-08-24'),
    ownerRequiresApproval: false,
    now: NOW,
  }).unwrap();
}

class FakeEntryRepository implements HourEntryRepository {
  constructor(private readonly entry: HourEntry) {}
  async findById(): Promise<HourEntry | null> {
    return this.entry;
  }
  findByLegacyId(): Promise<HourEntry | null> {
    throw new Error('not implemented');
  }
  search(): Promise<never> {
    throw new Error('not implemented');
  }
  save(): Promise<void> {
    throw new Error('not implemented');
  }
  delete(): Promise<void> {
    throw new Error('not implemented');
  }
  sumApprovedHoursForProject(): Promise<number> {
    throw new Error('not implemented');
  }
}

class FakeUserReader implements HourEntryUserReader {
  async findById(id: string): Promise<HourEntryUserReference | null> {
    return { id, fullName: 'Nombre Apellido', role: 'collaborator', status: 'active' };
  }
  async findManyByIds(): Promise<HourEntryUserReference[]> {
    return [];
  }
}

class FakeProjectReader implements HourEntryProjectReader {
  async findById(): Promise<null> {
    return null;
  }
  async findManyByIds(): Promise<never[]> {
    return [];
  }
  async isProjectApprover(): Promise<boolean> {
    return false;
  }
}

class FakeTeamReader implements HourEntryTeamReader {
  constructor(private readonly teamMemberUserIds: string[] = []) {}
  async isTeamLeaderOfMember(): Promise<boolean> {
    return false;
  }
  async findTeamMemberUserIds(): Promise<string[]> {
    return this.teamMemberUserIds;
  }
  async findTeamForUser(): Promise<null> {
    return null;
  }
}

function buildUseCase(ownerId: string, teamMemberUserIds: string[] = []) {
  return new GetHourEntryUseCase(
    new FakeEntryRepository(buildEntry(ownerId)),
    new FakeUserReader(),
    new FakeProjectReader(),
    new FakeTeamReader(teamMemberUserIds),
  );
}

describe('GetHourEntryUseCase', () => {
  it('deja ver el propio registro', async () => {
    const useCase = buildUseCase('user-1');
    const result = await useCase.execute({ entryId: 'entry-1', actor: { userId: 'user-1', email: 'a@kabeli.cl' }, actorPermissions: ['hours:read_own'] });
    expect(result.isOk()).toBe(true);
  });

  it('con hours:read_all deja ver el de cualquiera', async () => {
    const useCase = buildUseCase('user-2');
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_all'],
    });
    expect(result.isOk()).toBe(true);
  });

  it('con hours:read_team deja ver el de un miembro de su equipo', async () => {
    const useCase = buildUseCase('user-2', ['user-2']);
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });
    expect(result.isOk()).toBe(true);
  });

  it('con hours:read_team NO deja ver el de alguien fuera de su equipo', async () => {
    const useCase = buildUseCase('user-2', ['user-3']);
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });
    expect(result.isErr()).toBe(true);
  });

  it('solo con hours:read_own NO deja ver el registro de otra persona', async () => {
    const useCase = buildUseCase('user-2');
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_own'],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('HOUR_ENTRY_NOT_ASSIGNED');
  });
});
