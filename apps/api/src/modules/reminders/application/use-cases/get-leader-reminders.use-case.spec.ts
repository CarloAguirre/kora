import { describe, expect, it, vi } from 'vitest';
import type { Permission, RoleCode } from '@kora/contracts';
import type { HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { DailyHours, HourReminderReader } from '../ports/hour-reminder-reader.port';
import type { LedProjectReader, LedProjectTeamRow } from '../ports/led-project-reader.port';
import { GetLeaderRemindersUseCase } from './get-leader-reminders.use-case';

const LEADER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEADER_PERMISSIONS: Permission[] = ['hours:register', 'hours:read_own', 'hours:read_team', 'hours:approve'];
// Lunes 20-10-2026.
const TODAY = '2026-10-20';

function team(overrides: Partial<LedProjectTeamRow> = {}): LedProjectTeamRow {
  return {
    projectId: 'p1',
    projectSlug: 'portal',
    projectName: 'Portal proveedores',
    clientName: 'Hites',
    salesStage: 'approved',
    startDate: '2026-06-01',
    endDate: '2026-12-31',
    teamName: 'UX',
    assignedHours: 100,
    teamHasHours: true,
    ...overrides,
  };
}

function setup({
  daily = [],
  holidays = [],
  firstEntryDate = '2026-10-01',
  teams = [],
}: { daily?: DailyHours[]; holidays?: string[]; firstEntryDate?: string | null; teams?: LedProjectTeamRow[] } = {}) {
  const hourEntries = { summarize: vi.fn().mockResolvedValue({ entries: 12, hours: 34.5 }) };
  const reader = {
    findFirstEntryDate: vi.fn().mockResolvedValue(firstEntryDate),
    findHolidays: vi.fn(async (from: string, to: string) => holidays.filter((day) => day >= from && day <= to)),
    sumDailyHours: vi.fn(async (_userIds: readonly string[], from: string, to: string) =>
      daily.filter((row) => row.date >= from && row.date <= to),
    ),
  };
  const ledProjects = { listTeamsOfLedProjects: vi.fn().mockResolvedValue(teams) };
  const useCase = new GetLeaderRemindersUseCase(
    hourEntries as unknown as HourEntryRepository,
    reader as unknown as HourReminderReader,
    ledProjects as LedProjectReader,
  );
  const run = (role: RoleCode = 'leader', permissions: Permission[] = LEADER_PERMISSIONS) =>
    useCase.execute({ userId: LEADER, role, permissions, today: TODAY }).then((result) => result.unwrap());
  return { run, hourEntries, ledProjects };
}

const fullDay = (date: string): DailyHours => ({ userId: LEADER, date, hours: 8 });

describe('GetLeaderRemindersUseCase', () => {
  it('a quien no es líder no le calcula nada', async () => {
    const { run, hourEntries, ledProjects } = setup();

    expect(await run('pmo')).toEqual({ pendingApprovals: { entries: 0, hours: 0 }, missingHourDays: [], projectsMissingData: [] });
    expect(hourEntries.summarize).not.toHaveBeenCalled();
    expect(ledProjects.listTeamsOfLedProjects).not.toHaveBeenCalled();
  });

  it('cuenta las horas por aprobar con el alcance de su cola, sin las propias', async () => {
    const { run, hourEntries } = setup();

    expect((await run()).pendingApprovals).toEqual({ entries: 12, hours: 34.5 });
    expect(hourEntries.summarize).toHaveBeenCalledWith({ status: 'pending', leaderScopeUserId: LEADER, excludeUserId: LEADER });
  });

  it('lista los días hábiles con menos de 8 h, sin hoy, feriados ni días previos a su primer registro', async () => {
    const { run } = setup({
      firstEntryDate: '2026-10-08',
      holidays: ['2026-10-12'],
      daily: [
        ...['2026-10-08', '2026-10-09', '2026-10-13', '2026-10-15', '2026-10-16'].map(fullDay),
        { userId: LEADER, date: '2026-10-14', hours: 5 },
      ],
    });

    expect((await run()).missingHourDays).toEqual([
      { date: '2026-10-14', hoursRegistered: 5 },
      // 17-10 y 18-10 son fin de semana; hoy (20-10) todavía no cuenta.
      { date: '2026-10-19', hoursRegistered: 0 },
    ]);
  });

  it('no calcula horas por registrar para quien nunca registró', async () => {
    const { run } = setup({ firstEntryDate: null });

    expect((await run()).missingHourDays).toEqual([]);
  });

  it('agrupa por proyecto lo que falta: fechas y equipos con horas sin HH asignadas', async () => {
    const { run } = setup({
      teams: [
        team({ startDate: null, assignedHours: null }),
        team({ teamName: 'RPA', assignedHours: 0 }),
        // Sin horas del equipo: no se le piden HH asignadas.
        team({ teamName: 'QA', assignedHours: null, teamHasHours: false }),
        team({ projectId: 'p2', projectName: 'Completo' }),
        team({ projectId: 'p3', projectName: 'Prospecto', salesStage: 'prospect', startDate: null, assignedHours: null }),
      ],
    });

    expect((await run()).projectsMissingData).toEqual([
      {
        projectId: 'p1',
        projectSlug: 'portal',
        projectName: 'Portal proveedores',
        clientName: 'Hites',
        missingDates: true,
        teamsWithoutAssignedHours: ['UX', 'RPA'],
      },
    ]);
  });
});
