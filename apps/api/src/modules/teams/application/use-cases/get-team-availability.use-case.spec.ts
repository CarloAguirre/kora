import { describe, expect, it, vi } from 'vitest';
import { GetTeamAvailabilityUseCase } from './get-team-availability.use-case';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TeamMemberRecord, TeamMemberRepository } from '../../domain/repositories/team-member.repository';

function member(id: string, status: TeamMemberRecord['userStatus']): TeamMemberRecord {
  return {
    id: `member-${id}`,
    teamId: 'team-rpa',
    userId: `user-${id}`,
    userFullName: `Usuario ${id}`,
    userEmail: `${id}@kabeli.cl`,
    userStatus: status,
    userRole: 'collaborator',
    position: null,
    weeklyHours: 40,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    leftAt: null,
  };
}

describe('GetTeamAvailabilityUseCase', () => {
  it('excluye al usuario deshabilitado de la disponibilidad sin alterar las horas de los demás', async () => {
    const teams = {
      findById: vi.fn().mockResolvedValue({ id: 'team-rpa', isDeleted: false }),
      getHoursByMemberAndDate: vi.fn().mockResolvedValue([
        { teamMemberId: 'member-active', date: '2026-11-02', approvedHours: 6, pendingHours: 2 },
        { teamMemberId: 'member-disabled', date: '2026-11-02', approvedHours: 8, pendingHours: 0 },
        { teamMemberId: 'member-blocked', date: '2026-11-02', approvedHours: 4, pendingHours: 0 },
      ]),
    } as unknown as TeamRepository;
    const members = {
      listActiveForTeam: vi.fn().mockResolvedValue([
        member('active', 'active'),
        member('disabled', 'disabled'),
        member('blocked', 'blocked'),
      ]),
    } as unknown as TeamMemberRepository;
    const useCase = new GetTeamAvailabilityUseCase(teams, members);

    const result = await useCase.execute({
      teamId: 'team-rpa',
      dateFrom: '2026-11-02',
      dateTo: '2026-11-03',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    // El estado "blocked" no es baja administrativa: misma política que el detalle del equipo.
    expect(result.value.members.map((m) => m.userId)).toEqual(['user-active', 'user-blocked']);
    expect(result.value.members[0]?.days).toEqual([
      { date: '2026-11-02', hours: 6, pendingHours: 2 },
      { date: '2026-11-03', hours: 0, pendingHours: 0 },
    ]);
    expect(result.value.members[1]?.days[0]).toEqual({
      date: '2026-11-02',
      hours: 4,
      pendingHours: 0,
    });
  });

  it('retorna una disponibilidad vacía cuando todos los miembros vigentes están deshabilitados', async () => {
    const teams = {
      findById: vi.fn().mockResolvedValue({ id: 'team-rpa', isDeleted: false }),
      getHoursByMemberAndDate: vi.fn().mockResolvedValue([
        { teamMemberId: 'member-disabled', date: '2026-11-02', approvedHours: 8, pendingHours: 1 },
      ]),
    } as unknown as TeamRepository;
    const members = {
      listActiveForTeam: vi.fn().mockResolvedValue([member('disabled', 'disabled')]),
    } as unknown as TeamMemberRepository;
    const useCase = new GetTeamAvailabilityUseCase(teams, members);

    const result = await useCase.execute({
      teamId: 'team-rpa',
      dateFrom: '2026-11-02',
      dateTo: '2026-11-02',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.members).toEqual([]);
  });
});
