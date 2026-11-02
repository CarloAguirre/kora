import { describe, expect, it, vi } from 'vitest';
import { GetTeamUseCase } from './get-team.use-case';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TeamMemberRecord, TeamMemberRepository } from '../../domain/repositories/team-member.repository';
import type { TeamUserReader } from '../ports/team-user-reader.port';
import type { TeamTypeRepository } from '../../domain/repositories/team-type.repository';

class FakeTeamRepository implements Partial<TeamRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findBySlug = vi.fn().mockResolvedValue(null);
}

const NEVER_USED = {} as never;

function buildUseCase(teams: FakeTeamRepository) {
  return new GetTeamUseCase(
    teams as unknown as TeamRepository,
    NEVER_USED as TeamMemberRepository,
    NEVER_USED as TeamUserReader,
    NEVER_USED as TeamTypeRepository,
  );
}

/**
 * `GET /teams/:id` acepta UUID o slug. Fija qué método del repositorio se
 * llama según la forma del valor recibido.
 */
describe('GetTeamUseCase — resolución por id o slug', () => {
  it('con un UUID, busca por id y no por slug', async () => {
    const teams = new FakeTeamRepository();
    const useCase = buildUseCase(teams);

    await useCase.execute({ teamId: '11111111-1111-4111-8111-111111111111' });

    expect(teams.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(teams.findBySlug).not.toHaveBeenCalled();
  });

  it('con un slug, busca por slug y no por id', async () => {
    const teams = new FakeTeamRepository();
    const useCase = buildUseCase(teams);

    await useCase.execute({ teamId: 'desarrollo' });

    expect(teams.findBySlug).toHaveBeenCalledWith('desarrollo');
    expect(teams.findById).not.toHaveBeenCalled();
  });
});

/** Disponibilidad operativa: la relación de equipo y las HH históricas no se borran. */
describe('GetTeamUseCase — integrantes disponibles', () => {
  it('oculta usuarios disabled y blocked de la lista y ajusta el contador', async () => {
    const teamId = '11111111-1111-4111-8111-111111111111';
    const mockMember = (id: string, status: TeamMemberRecord['userStatus']): TeamMemberRecord => ({
      id: `member-${id}`,
      teamId,
      userId: `user-${id}`,
      userFullName: `Usuario ${id}`,
      userEmail: `${id}@kabeli.cl`,
      userStatus: status,
      userRole: 'collaborator',
      position: 'Colaborador',
      weeklyHours: 40,
      joinedAt: new Date('2026-05-19T16:01:31.832Z'),
      leftAt: null,
    });
    const listActiveForTeam = vi.fn().mockResolvedValue([
      mockMember('active', 'active'),
      mockMember('julio', 'disabled'),
      mockMember('blocked', 'blocked'),
    ]);
    const snapshot = {
      id: teamId, name: 'RPA', slug: 'rpa', description: null,
      isActive: true, leaderUserId: null, teamTypeId: null,
      legacyId: null, createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const teams = {
      findById: vi.fn().mockResolvedValue({ id: teamId, isDeleted: false, leaderUserId: null, teamTypeId: null, toSnapshot: () => snapshot }),
    } as unknown as TeamRepository;
    const useCase = new GetTeamUseCase(
      teams,
      { listActiveForTeam } as unknown as TeamMemberRepository,
      NEVER_USED as TeamUserReader,
      NEVER_USED as TeamTypeRepository,
    );

    const result = await useCase.execute({ teamId });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.memberCount).toBe(1);
    expect(result.value.members.map((member) => member.userId)).toEqual(['user-active']);
    expect(listActiveForTeam).toHaveBeenCalledWith(teamId);
  });
});
