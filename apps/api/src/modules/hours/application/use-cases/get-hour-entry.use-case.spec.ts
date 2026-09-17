import { describe, expect, it } from 'vitest';
import type { HourEntry } from '../../domain/entities/hour-entry.entity';
import { HourEntry as HourEntryEntity } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReader, HourEntryUserReference } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import { GetHourEntryUseCase } from './get-hour-entry.use-case';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildEntry(userId: string, projectId: string | null = 'project-1'): HourEntry {
  return HourEntryEntity.create({
    id: 'entry-1',
    userId,
    assignment: projectId ? 'Proyecto' : 'Vacaciones',
    projectId,
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
  sumApprovedHoursForProjects(): Promise<number> {
    throw new Error('not implemented');
  }
  sumHoursForUserAndDate(): Promise<number> {
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
  constructor(private readonly approver = false) {}
  async findById(): Promise<null> {
    return null;
  }
  async findManyByIds(): Promise<never[]> {
    return [];
  }
  async findModuleById(): Promise<null> {
    return null;
  }
  async isProjectApprover(): Promise<boolean> {
    return this.approver;
  }
  async findApprovers(): Promise<never[]> {
    return [];
  }
}

class FakeTeamReader implements HourEntryTeamReader {
  constructor(private readonly teamMemberUserIds: string[] = []) {}
  async isTeamLeaderOfMember(_leaderUserId: string, memberUserId: string): Promise<boolean> {
    return this.teamMemberUserIds.includes(memberUserId);
  }
  async findTeamMemberUserIds(): Promise<string[]> {
    return this.teamMemberUserIds;
  }
  async findTeamForUser(): Promise<null> {
    return null;
  }
}

function buildUseCase(
  ownerId: string,
  options: { projectId?: string | null; isProjectApprover?: boolean; teamMemberUserIds?: string[] } = {},
) {
  return new GetHourEntryUseCase(
    new FakeEntryRepository(buildEntry(ownerId, options.projectId === undefined ? 'project-1' : options.projectId)),
    new FakeUserReader(),
    new FakeProjectReader(options.isProjectApprover ?? false),
    new FakeTeamReader(options.teamMemberUserIds ?? []),
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

  /**
   * Con proyecto, la visibilidad de `hours:read_team` pasa por
   * `isProjectApprover` (EXCLUYENTE, acotado a ESE proyecto) — no por
   * `findTeamMemberUserIds` (equipos que lidero en cualquier proyecto). Ver
   * DECISION-M4-HORAS.md "Cuarta corrección": liderar "Desarrollo" en un
   * proyecto ajeno no debe dar acceso a las horas de "Desarrollo" en este.
   */
  it('con proyecto y hours:read_team, deja ver el registro cuando SÍ es el aprobador de ese proyecto', async () => {
    const useCase = buildUseCase('user-2', { isProjectApprover: true, teamMemberUserIds: ['user-2'] });
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });
    expect(result.isOk()).toBe(true);
  });

  it('con proyecto y hours:read_team, NO deja ver el registro aunque lidere al dueño en OTRO proyecto', async () => {
    // `teamMemberUserIds` simula que el actor lidera algún equipo de
    // 'user-2' en otro proyecto — no debe alcanzar para ESTE registro.
    const useCase = buildUseCase('user-2', { isProjectApprover: false, teamMemberUserIds: ['user-2'] });
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });
    expect(result.isErr()).toBe(true);
  });

  it('sin proyecto y hours:read_team, deja ver el de un miembro de su equipo', async () => {
    const useCase = buildUseCase('user-2', { projectId: null, teamMemberUserIds: ['user-2'] });
    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'user-1', email: 'a@kabeli.cl' },
      actorPermissions: ['hours:read_team'],
    });
    expect(result.isOk()).toBe(true);
  });

  it('sin proyecto y hours:read_team, NO deja ver el de alguien fuera de su equipo', async () => {
    const useCase = buildUseCase('user-2', { projectId: null, teamMemberUserIds: ['user-3'] });
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
