import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../../../test/fakes';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TeamReportProjectRow, TeamReportReader } from '../ports/team-report-reader.port';
import type { TeamUserReader } from '../ports/team-user-reader.port';
import type { CreateNotificationInput, NotificationInbox } from '../../../notifications/application/ports/notification-inbox.port';
import { RequestTeamReportDataUseCase } from './request-team-report-data.use-case';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const LEADER_A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'José Aponte' };
const LEADER_B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullName: 'Camila Ruiz' };
const ACTOR = { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'eduardo@kabeli.cl' };

function project(id: string, overrides: Partial<TeamReportProjectRow> = {}): TeamReportProjectRow {
  return {
    projectId: id,
    name: `Proyecto ${id}`,
    slug: `proyecto-${id}`,
    client: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', companyName: 'Goldfields' },
    status: 'active',
    salesStage: 'approved',
    startDate: '2026-06-01',
    endDate: '2026-09-30',
    assignedHours: 100,
    responsible: null,
    projectLeader: LEADER_A,
    comment: null,
    dataRequestedAt: null,
    ...overrides,
  };
}

function setup(
  projects: TeamReportProjectRow[],
  {
    isLeader = true,
    projectsWithHours = projects.map((p) => p.projectId),
    projectsWithPendingHoursOnly = [] as string[],
  } = {},
) {
  const created: CreateNotificationInput[] = [];
  const teams = {
    findById: vi.fn().mockResolvedValue({ id: TEAM_ID, name: 'UX-UI', isDeleted: false, leaderUserId: ACTOR.userId }),
    isLeaderOfTeam: vi.fn().mockResolvedValue(isLeader),
  };
  const reports = {
    listProjects: vi.fn().mockResolvedValue(projects),
    listPeople: vi.fn().mockResolvedValue([{ id: ACTOR.userId, fullName: 'Eduardo Aranda' }]),
    sumHours: vi.fn().mockResolvedValue([
      ...projectsWithHours.map((projectId) => ({
        projectId,
        userId: ACTOR.userId,
        periodApproved: 0,
        periodPending: 0,
        accumulatedApproved: 8,
        accumulatedPending: 0,
      })),
      ...projectsWithPendingHoursOnly.map((projectId) => ({
        projectId,
        userId: ACTOR.userId,
        periodApproved: 0,
        periodPending: 3,
        accumulatedApproved: 0,
        accumulatedPending: 3,
      })),
    ]),
    markDataRequested: vi.fn().mockResolvedValue(undefined),
  };
  const users = { findById: vi.fn().mockResolvedValue({ id: ACTOR.userId, fullName: 'Eduardo Aranda' }) };
  const inbox = { create: vi.fn(async (input: CreateNotificationInput) => void created.push(input)) };
  const useCase = new RequestTeamReportDataUseCase(
    teams as unknown as TeamRepository,
    reports as unknown as TeamReportReader,
    users as unknown as TeamUserReader,
    inbox as unknown as NotificationInbox,
    new FixedClock(new Date('2026-10-16T15:00:00.000Z')),
  );
  return { useCase, created, reports };
}

describe('RequestTeamReportDataUseCase', () => {
  it('manda UNA notificación por Líder PM con todos sus proyectos y lo que falta en cada uno', async () => {
    const { useCase, created, reports } = setup([
      project('1', { startDate: null }),
      project('2', { assignedHours: 0, endDate: null }),
      project('3', { assignedHours: null, projectLeader: LEADER_B }),
    ]);

    const result = await useCase.execute({
      teamId: TEAM_ID,
      projectIds: ['1', '2', '3'],
      note: 'antes del jueves',
      actor: ACTOR,
      actorPermissions: [],
    });

    expect(result.unwrap()).toEqual({ notifiedLeaders: 2, requestedProjects: 3 });
    const toA = created.find((n) => n.userId === LEADER_A.id)!;
    expect(toA.title).toBe('Eduardo Aranda (UX-UI) te pide completar datos de 2 proyectos');
    expect(toA.data.items.map((item) => item.missing)).toEqual([['dates'], ['assigned_hours', 'dates']]);
    expect(toA.data.note).toBe('antes del jueves');
    expect(created.find((n) => n.userId === LEADER_B.id)!.data.items).toHaveLength(1);
    expect(reports.markDataRequested).toHaveBeenCalledWith(TEAM_ID, ['1', '2', '3'], new Date('2026-10-16T15:00:00.000Z'));
  });

  it('omite proyectos no pedidos, ya completos o sin Líder PM', async () => {
    const { useCase, created } = setup([
      project('1', { startDate: null }),
      project('2'),
      project('3', { endDate: null, projectLeader: null }),
      project('4', { endDate: null }),
    ]);

    const result = await useCase.execute({ teamId: TEAM_ID, projectIds: ['1', '2', '3'], note: undefined, actor: ACTOR, actorPermissions: [] });

    expect(result.unwrap()).toEqual({ notifiedLeaders: 1, requestedProjects: 1 });
    expect(created[0]!.data.items.map((item) => item.projectId)).toEqual(['1']);
  });

  it('solo pide datos de proyectos —no prospectos— donde el equipo registró horas, aprobadas o por aprobar', async () => {
    const { useCase, created, reports } = setup(
      [
        project('1', { startDate: null }),
        project('2', { startDate: null, assignedHours: 0, salesStage: 'prospect' }),
        project('3', { assignedHours: 0, startDate: null }),
        project('4', { assignedHours: 0 }),
      ],
      { projectsWithHours: ['1', '2'], projectsWithPendingHoursOnly: ['4'] },
    );

    const result = await useCase.execute({
      teamId: TEAM_ID,
      projectIds: ['1', '2', '3', '4'],
      note: undefined,
      actor: ACTOR,
      actorPermissions: [],
    });

    expect(result.unwrap()).toEqual({ notifiedLeaders: 1, requestedProjects: 2 });
    expect(created[0]!.data.items.map((item) => [item.projectId, item.missing])).toEqual([
      ['1', ['dates']],
      ['4', ['assigned_hours']],
    ]);
    expect(reports.markDataRequested).toHaveBeenCalledWith(TEAM_ID, ['1', '4'], new Date('2026-10-16T15:00:00.000Z'));
  });

  it('rechaza a quien no lidera el equipo ni gestiona proyectos', async () => {
    const { useCase, created } = setup([project('1', { startDate: null })], { isLeader: false });

    const result = await useCase.execute({ teamId: TEAM_ID, projectIds: ['1'], note: undefined, actor: ACTOR, actorPermissions: [] });

    expect(result.isErr()).toBe(true);
    expect(created).toHaveLength(0);
  });
});
