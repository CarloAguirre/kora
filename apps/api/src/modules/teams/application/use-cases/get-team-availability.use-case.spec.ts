import { describe, expect, it, vi } from 'vitest';
import { GetTeamAvailabilityUseCase } from './get-team-availability.use-case';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TeamMemberRepository, TeamMemberRecord } from '../../domain/repositories/team-member.repository';

const teamId = '0777e456-fd76-445e-83f1-afc25061c101';
const activeId = '0777e456-fd76-445e-83f1-afc25061c102';
const disabledId = '0777e456-fd76-445e-83f1-afc25061c103';

function member(userId: string, status: TeamMemberRecord['userStatus']): TeamMemberRecord {
  return {
    id: userId, teamId, userId, userFullName: status === 'active' ? 'Activo' : 'Julio Andrés Alarcón Caballero',
    userEmail: userId + '@kabeli.cl', userStatus: status,
    userRole: 'collaborator', position: null, weeklyHours: 40,
    joinedAt: new Date('2026-01-01T00:00:00Z'), leftAt: null,
  };
}

describe('GetTeamAvailabilityUseCase — usuarios deshabilitados', () => {
  it('solo presenta usuarios activos aun si la membresía antigua sigue vigente', async () => {
    const teams = {
      findById: vi.fn().mockResolvedValue({ id: teamId, isDeleted: false }),
      getHoursByMemberAndDate: vi.fn().mockResolvedValue([
        { teamMemberId: activeId, date: '2026-11-02', approvedHours: 5, pendingHours: 0 },
        { teamMemberId: disabledId, date: '2026-11-02', approvedHours: 8, pendingHours: 2 },
      ]),
    };
    const members = {
      listActiveForTeam: vi.fn().mockResolvedValue([
        member(activeId, 'active'), member(disabledId, 'disabled'),
      ]),
    };
    const useCase = new GetTeamAvailabilityUseCase(
      teams as unknown as TeamRepository, members as unknown as TeamMemberRepository,
    );

    const result = await useCase.execute({
      teamId, dateFrom: '2026-11-02', dateTo: '2026-11-06',
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.members).toHaveLength(1);
    expect(result.value.members[0]?.userId).toBe(activeId);
    expect(result.value.members[0]?.days[0]).toEqual({
      date: '2026-11-02', hours: 5, pendingHours: 0,
    });
    expect(members.listActiveForTeam).toHaveBeenCalledWith(teamId);
    // El endpoint de disponibilidad solo filtra la presentación: no altera datos.
    expect(teams.getHoursByMemberAndDate).toHaveBeenCalledOnce();
  });
});
