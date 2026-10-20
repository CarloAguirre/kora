import { describe, expect, it } from 'vitest';
import type { Logger } from '@kora/core';
import { RecordingNotificationSender } from '../../../../test/fakes';
import type { ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { HourReminderReader, PendingHourEntryRow, ReminderRecipient } from '../ports/hour-reminder-reader.port';
import { SendPendingHoursDigestUseCase } from './send-pending-hours-digest.use-case';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const TODAY = '2026-10-16';

function user(id: string): ReminderRecipient {
  return { userId: id, email: `${id}@kabeli.cl`, firstName: id, fullName: `${id} Pérez` };
}

function entry(overrides: Partial<PendingHourEntryRow> & Pick<PendingHourEntryRow, 'id' | 'ownerUserId'>): PendingHourEntryRow {
  return {
    ownerFullName: `${overrides.ownerUserId} Pérez`,
    projectId: null,
    projectName: null,
    assignment: null,
    designatedApproverUserId: null,
    ticketCode: null,
    date: '2026-10-14',
    hours: 4,
    createdAt: new Date('2026-10-14T15:00:00Z'),
    ...overrides,
  };
}

function setup(input: {
  pending: PendingHourEntryRow[];
  projectApprovers?: Record<string, string[]>;
  teamLeaders?: Record<string, string[]>;
  activeUsers?: string[];
  holidays?: string[];
}) {
  const reader: HourReminderReader = {
    findHoursRegistrants: async () => [],
    findFirstEntryDate: async () => null,
    sumDailyHours: async () => [],
    findHolidays: async (from, to) => (input.holidays ?? []).filter((day) => day >= from && day <= to),
    findPendingHourEntries: async () => input.pending,
    findTeamLeaderIdsForMember: async (memberId) => input.teamLeaders?.[memberId] ?? [],
    findActiveUsersByIds: async (ids) => ids.filter((id) => (input.activeUsers ?? ids).includes(id)).map(user),
  };
  const projects = {
    findApproverCandidatesForMember: async (projectId: string, memberId: string | null) =>
      (input.projectApprovers?.[`${projectId}:${memberId}`] ?? []).map((id) => ({ id, fullName: id })),
  } as unknown as ProjectRepository;
  const sender = new RecordingNotificationSender();
  return { sender, useCase: new SendPendingHoursDigestUseCase(reader, projects, sender, silentLogger) };
}

describe('SendPendingHoursDigestUseCase', () => {
  it('agrupa por aprobador usando el aprobador del proyecto, el designado o el líder del equipo', async () => {
    const { sender, useCase } = setup({
      pending: [
        entry({ id: 'h1', ownerUserId: 'ana', projectId: 'p1', projectName: 'App Walvy' }),
        entry({ id: 'h2', ownerUserId: 'ana', assignment: 'Vacaciones', designatedApproverUserId: 'carla' }),
        entry({ id: 'h3', ownerUserId: 'beto', assignment: 'Capacitación' }),
        entry({ id: 'h4', ownerUserId: 'beto', projectId: 'p2', projectName: 'Soporte Amicar', ticketCode: 'TK-1200' }),
      ],
      projectApprovers: { 'p1:ana': ['luis'], 'p2:beto': ['luis'] },
      teamLeaders: { beto: ['luis', 'carla'] },
    });

    const result = (await useCase.execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result).toMatchObject({ pendingEntries: 4, approvers: 2, sent: 2, entriesWithoutApprover: 0 });
    const byRecipient = Object.fromEntries(sender.pendingHoursDigests.map((d) => [d.recipientEmail, d.items]));
    expect(byRecipient['luis@kabeli.cl']!.map((i) => [i.kind, i.label])).toEqual([
      ['project', 'App Walvy'],
      ['no_project', 'Capacitación'],
      ['ticket', 'TK-1200 · Soporte Amicar'],
    ]);
    expect(byRecipient['carla@kabeli.cl']!.map((i) => i.label)).toEqual(['Vacaciones', 'Capacitación']);
    expect(byRecipient['luis@kabeli.cl']![0]!.daysPending).toBe(2);
  });

  it('nadie recibe sus propias horas, y lo que queda sin aprobador se cuenta aparte', async () => {
    const { sender, useCase } = setup({
      pending: [entry({ id: 'h1', ownerUserId: 'luis', projectId: 'p1', projectName: 'App' })],
      projectApprovers: { 'p1:luis': ['luis'] },
    });

    const result = (await useCase.execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result).toMatchObject({ approvers: 0, sent: 0, entriesWithoutApprover: 1 });
    expect(sender.pendingHoursDigests).toHaveLength(0);
  });

  it('no escribe a aprobadores inactivos', async () => {
    const { sender, useCase } = setup({
      pending: [entry({ id: 'h1', ownerUserId: 'ana', designatedApproverUserId: 'carla' })],
      activeUsers: [],
    });

    const result = (await useCase.execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result.sent).toBe(0);
    expect(sender.pendingHoursDigests).toHaveLength(0);
  });

  it('en dryRun solo devuelve la vista previa; en feriado no hace nada', async () => {
    const dry = setup({ pending: [entry({ id: 'h1', ownerUserId: 'ana', hours: 2.5, designatedApproverUserId: 'carla' })] });
    const preview = (await dry.useCase.execute({ today: TODAY, dryRun: true })).unwrap();
    expect(preview.preview).toEqual([{ email: 'carla@kabeli.cl', items: 1, hours: 2.5 }]);
    expect(dry.sender.pendingHoursDigests).toHaveLength(0);

    const holiday = setup({ pending: [entry({ id: 'h1', ownerUserId: 'ana', designatedApproverUserId: 'carla' })], holidays: [TODAY] });
    const skipped = (await holiday.useCase.execute({ today: TODAY, dryRun: false })).unwrap();
    expect(skipped.skippedHoliday).toBe(true);
    expect(holiday.sender.pendingHoursDigests).toHaveLength(0);
  });
});
