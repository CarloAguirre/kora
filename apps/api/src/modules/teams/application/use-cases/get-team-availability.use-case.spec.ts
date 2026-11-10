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

function availabilityMember(id: string, status: TeamMemberRecord['userStatus']): TeamMemberRecord {
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
        availabilityMember('active', 'active'),
        availabilityMember('disabled', 'disabled'),
        availabilityMember('blocked', 'blocked'),
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
      listActiveForTeam: vi.fn().mockResolvedValue([availabilityMember('disabled', 'disabled')]),
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
