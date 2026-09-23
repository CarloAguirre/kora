import { describe, expect, it, vi } from 'vitest';
import { GetTeamUseCase } from './get-team.use-case';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TeamMemberRepository } from '../../domain/repositories/team-member.repository';
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
