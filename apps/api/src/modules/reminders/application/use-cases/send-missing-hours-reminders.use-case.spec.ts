import { describe, expect, it } from 'vitest';
import type { Logger } from '@kora/core';
import { RecordingNotificationSender } from '../../../../test/fakes';
import type {
  DailyHours,
  HourReminderReader,
  HoursRegistrant,
} from '../ports/hour-reminder-reader.port';
import { SendMissingHoursRemindersUseCase } from './send-missing-hours-reminders.use-case';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

function registrant(id: string, firstEntryDate: string | null): HoursRegistrant {
  return { userId: id, email: `${id}@kabeli.cl`, firstName: id, fullName: `${id} Pérez`, firstEntryDate };
}

function fakeReader(input: { registrants: HoursRegistrant[]; daily?: DailyHours[]; holidays?: string[] }): HourReminderReader {
  return {
    findHoursRegistrants: async () => input.registrants,
    sumDailyHours: async (userIds, from, to) =>
      (input.daily ?? []).filter((row) => userIds.includes(row.userId) && row.date >= from && row.date <= to),
    findHolidays: async (from, to) => (input.holidays ?? []).filter((day) => day >= from && day <= to),
    findPendingHourEntries: async () => [],
    findTeamLeaderIdsForMember: async () => [],
    findActiveUsersByIds: async () => [],
  };
}

function fullWeek(userId: string, days: string[]): DailyHours[] {
  return days.map((date) => ({ userId, date, hours: 8 }));
}

// Viernes 2026-10-16. Semana: lun 12 (feriado), mar 13, mié 14, jue 15, vie 16.
const TODAY = '2026-10-16';

describe('SendMissingHoursRemindersUseCase', () => {
  it('lista los días hábiles bajo 8 h desde el primer registro, sin fines de semana ni feriados', async () => {
    const sender = new RecordingNotificationSender();
    const reader = fakeReader({
      registrants: [registrant('ana', '2026-10-13')],
      daily: [
        { userId: 'ana', date: '2026-10-13', hours: 8 },
        { userId: 'ana', date: '2026-10-14', hours: 4 },
        { userId: 'ana', date: '2026-10-15', hours: 8 },
      ],
      holidays: ['2026-10-12'],
    });

    const result = (await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result.sent).toBe(1);
    expect(sender.missingHoursReminders).toHaveLength(1);
    const reminder = sender.missingHoursReminders[0]!;
    expect(reminder.recipientEmail).toBe('ana@kabeli.cl');
    expect(reminder.days).toEqual([
      { date: '2026-10-14', hoursRegistered: 4 },
      { date: '2026-10-16', hoursRegistered: 0 },
    ]);
  });

  it('omite a quien tiene todo completo y a quien nunca registró horas', async () => {
    const sender = new RecordingNotificationSender();
    const reader = fakeReader({
      registrants: [registrant('ana', '2026-10-13'), registrant('beto', null)],
      daily: fullWeek('ana', ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']),
      holidays: ['2026-10-12'],
    });

    const result = (await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result).toMatchObject({ registrants: 2, sent: 0, skippedComplete: 1, skippedNoActivity: 1 });
    expect(sender.missingHoursReminders).toHaveLength(0);
  });

  it('no revisa más allá de 30 días aunque el primer registro sea anterior', async () => {
    const sender = new RecordingNotificationSender();
    const reader = fakeReader({ registrants: [registrant('ana', '2025-01-01')] });

    await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({ today: TODAY, dryRun: false });

    const days = sender.missingHoursReminders[0]!.days.map((day) => day.date);
    expect(days[0]).toBe('2026-09-17');
    expect(days.at(-1)).toBe(TODAY);
  });

  it('no envía nada si hoy es feriado', async () => {
    const sender = new RecordingNotificationSender();
    const reader = fakeReader({ registrants: [registrant('ana', '2026-10-01')], holidays: [TODAY] });

    const result = (await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result.skippedHoliday).toBe(true);
    expect(sender.missingHoursReminders).toHaveLength(0);
  });

  it('en dryRun devuelve la vista previa sin enviar, y onlyEmail limita a una persona', async () => {
    const sender = new RecordingNotificationSender();
    const reader = fakeReader({ registrants: [registrant('ana', '2026-10-15'), registrant('beto', '2026-10-15')] });

    const result = (
      await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({
        today: TODAY,
        dryRun: true,
        onlyEmail: 'BETO@kabeli.cl',
      })
    ).unwrap();

    expect(sender.missingHoursReminders).toHaveLength(0);
    expect(result.preview).toEqual([
      {
        email: 'beto@kabeli.cl',
        days: [
          { date: '2026-10-15', hoursRegistered: 0 },
          { date: '2026-10-16', hoursRegistered: 0 },
        ],
      },
    ]);
  });

  it('un envío fallido no corta el lote', async () => {
    const sender = new RecordingNotificationSender();
    sender.failFor.add('ana@kabeli.cl');
    const reader = fakeReader({ registrants: [registrant('ana', '2026-10-15'), registrant('beto', '2026-10-15')] });

    const result = (await new SendMissingHoursRemindersUseCase(reader, sender, silentLogger).execute({ today: TODAY, dryRun: false })).unwrap();

    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(sender.missingHoursReminders.map((r) => r.recipientEmail)).toEqual(['beto@kabeli.cl']);
  });
});
