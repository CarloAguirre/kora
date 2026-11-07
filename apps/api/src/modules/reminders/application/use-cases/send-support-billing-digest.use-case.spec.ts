import { describe, expect, it } from 'vitest';
import type { Logger } from '@kora/core';
import { RecordingNotificationSender } from '../../../../test/fakes';
import type { HourEntryFilters, HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { TicketClientReader } from '../../../tickets/application/ports/ticket-client-reader.port';
import type { TicketProjectReader } from '../../../tickets/application/ports/ticket-project-reader.port';
import type { SupportPlanRecord, SupportPlanRepository } from '../../../tickets/domain/repositories/support-plan.repository';
import type { HourReminderReader, ReminderRecipient } from '../ports/hour-reminder-reader.port';
import { SendSupportBillingDigestUseCase } from './send-support-billing-digest.use-case';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

function recipient(id: string): ReminderRecipient {
  return { userId: id, email: `${id}@kabeli.cl`, firstName: id, fullName: `${id} Pérez` };
}

function plan(overrides: Partial<SupportPlanRecord> & Pick<SupportPlanRecord, 'id' | 'clientId'>): SupportPlanRecord {
  return {
    slug: overrides.id,
    projectId: `proj-${overrides.id}`,
    planType: 'monthly',
    scope: 'single',
    surplusPolicy: 'accumulate',
    status: 'active',
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: null,
    contractedHours: 10,
    planValueUf: 5,
    extraHourValueUf: 1,
    currency: 'UF',
    name: `Soporte ${overrides.clientId}`,
    leaderUserId: null,
    primaryContactId: null,
    quotationLink: null,
    contractLink: null,
    additionalLinks: null,
    dueDayOfMonth: null,
    targetHoursCritical: null,
    targetHoursHigh: null,
    targetHoursMedium: null,
    targetHoursLow: null,
    closedAt: null,
    closeReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

interface HourEntryFixture {
  readonly projectId: string;
  readonly date: string;
  readonly hours: number;
  readonly status: 'approved' | 'pending';
}

function setup(input: { plans: SupportPlanRecord[]; hours?: HourEntryFixture[]; holidays?: string[]; admins?: string[] }) {
  const hours = input.hours ?? [];
  const inRange = (entry: HourEntryFixture, projectIds: readonly string[], from: Date, to: Date) =>
    projectIds.includes(entry.projectId) &&
    entry.date >= from.toISOString().slice(0, 10) &&
    entry.date <= to.toISOString().slice(0, 10);

  const reader = {
    findHolidays: async (from: string, to: string) => (input.holidays ?? []).filter((day) => day >= from && day <= to),
    findActiveAdminTierUsers: async () => (input.admins ?? ['ana', 'pmo']).map(recipient),
  } as unknown as HourReminderReader;
  const plans = {
    listAllActive: async () => input.plans,
    listLinkedProjectIds: async () => [],
  } as unknown as SupportPlanRepository;
  const clients = {
    findCompanyNames: async (ids: readonly string[]) => new Map(ids.map((id) => [id, `Cliente ${id}`])),
  } as unknown as TicketClientReader;
  const projects = { findManyByIds: async () => [] } as unknown as TicketProjectReader;
  const hourEntries = {
    sumApprovedHoursForProjects: async (projectIds: readonly string[], from: Date, to: Date) =>
      hours.filter((e) => e.status === 'approved' && inRange(e, projectIds, from, to)).reduce((sum, e) => sum + e.hours, 0),
    summarize: async (filters: HourEntryFilters) => {
      const matching = hours.filter(
        (e) => e.status === filters.status && inRange(e, filters.projectIds ?? [], filters.dateFrom!, filters.dateTo!),
      );
      return { entries: matching.length, hours: matching.reduce((sum, e) => sum + e.hours, 0) };
    },
  } as unknown as HourEntryRepository;

  const sender = new RecordingNotificationSender();
  return {
    sender,
    useCase: new SendSupportBillingDigestUseCase(reader, plans, clients, projects, hourEntries, sender, silentLogger),
  };
}

describe('SendSupportBillingDigestUseCase', () => {
  it('envía a cada admin/PMO cliente, tipo de contrato y HH aprobadas del mes', async () => {
    const { sender, useCase } = setup({
      plans: [
        plan({ id: 'p1', clientId: 'amicar', surplusPolicy: 'accumulate' }),
        plan({ id: 'p2', clientId: 'asys', surplusPolicy: 'expire' }),
        plan({ id: 'p3', clientId: 'cemin', planType: 'bundle', surplusPolicy: null }),
        plan({ id: 'p4', clientId: 'cbt', planType: 'on_demand', surplusPolicy: null }),
      ],
      hours: [
        { projectId: 'proj-p1', date: '2026-10-05', hours: 3, status: 'approved' },
        { projectId: 'proj-p1', date: '2026-10-20', hours: 2.5, status: 'approved' },
        { projectId: 'proj-p1', date: '2026-09-30', hours: 8, status: 'approved' },
        { projectId: 'proj-p1', date: '2026-10-29', hours: 1, status: 'pending' },
        { projectId: 'proj-p3', date: '2026-10-10', hours: 4, status: 'approved' },
      ],
    });

    const result = (await useCase.execute({ today: '2026-10-30', dryRun: false, onlyOnLastBusinessDay: true })).unwrap();

    expect(result).toMatchObject({ month: '2026-10', skippedNotLastBusinessDay: false, plans: 4, recipients: 2, sent: 2 });
    const digest = sender.supportBillingDigests[0]!;
    expect(digest.monthLabel).toBe('octubre de 2026');
    expect(digest.items.map((i) => [i.clientName, i.contractType, i.usedHours, i.pendingHours])).toEqual([
      ['Cliente amicar', 'Mensual · acumulado', 5.5, 1],
      ['Cliente asys', 'Mensual · con vencimiento', 0, 0],
      ['Cliente cbt', 'A demanda', 0, 0],
      ['Cliente cemin', 'Bolsa', 4, 0],
    ]);
  });

  it('solo envía el último día hábil del mes, saltando fines de semana y feriados', async () => {
    const { sender, useCase } = setup({ plans: [plan({ id: 'p1', clientId: 'amicar' })] });

    // 31/10/2026 es sábado: el último hábil es el viernes 30.
    const thursday = (await useCase.execute({ today: '2026-10-29', dryRun: false, onlyOnLastBusinessDay: true })).unwrap();
    expect(thursday.skippedNotLastBusinessDay).toBe(true);
    const saturday = (await useCase.execute({ today: '2026-10-31', dryRun: false, onlyOnLastBusinessDay: true })).unwrap();
    expect(saturday.skippedNotLastBusinessDay).toBe(true);
    expect(sender.supportBillingDigests).toHaveLength(0);

    // Si el viernes 30 fuera feriado, el último hábil pasa a ser el jueves 29.
    const { sender: withHoliday, useCase: holidayUseCase } = setup({
      plans: [plan({ id: 'p1', clientId: 'amicar' })],
      holidays: ['2026-10-30'],
    });
    const result = (await holidayUseCase.execute({ today: '2026-10-29', dryRun: false, onlyOnLastBusinessDay: true })).unwrap();
    expect(result.skippedNotLastBusinessDay).toBe(false);
    expect(withHoliday.supportBillingDigests).toHaveLength(2);
  });

  it('cuenta las HH desde el inicio del contrato y omite los que empiezan después del mes', async () => {
    const { sender, useCase } = setup({
      plans: [
        plan({ id: 'p1', clientId: 'nuevo', startDate: new Date('2026-10-15T00:00:00Z') }),
        plan({ id: 'p2', clientId: 'futuro', startDate: new Date('2026-11-01T00:00:00Z') }),
      ],
      hours: [
        { projectId: 'proj-p1', date: '2026-10-10', hours: 6, status: 'approved' },
        { projectId: 'proj-p1', date: '2026-10-16', hours: 2, status: 'approved' },
      ],
    });

    await useCase.execute({ today: '2026-10-23', dryRun: false, onlyOnLastBusinessDay: false });

    expect(sender.supportBillingDigests[0]!.items.map((i) => [i.clientName, i.usedHours])).toEqual([['Cliente nuevo', 2]]);
  });

  it('en dryRun no envía nada y devuelve lo que se enviaría', async () => {
    const { sender, useCase } = setup({ plans: [plan({ id: 'p1', clientId: 'amicar' })], admins: ['ana', 'pmo'] });

    const result = (
      await useCase.execute({ today: '2026-10-23', dryRun: true, onlyOnLastBusinessDay: false, onlyEmail: 'PMO@kabeli.cl' })
    ).unwrap();

    expect(result).toMatchObject({ recipients: 1, sent: 0 });
    expect(result.preview).toHaveLength(1);
    expect(sender.supportBillingDigests).toHaveLength(0);
  });

  it('un fallo de envío no corta el resto', async () => {
    const { sender, useCase } = setup({ plans: [plan({ id: 'p1', clientId: 'amicar' })] });
    sender.failFor.add('ana@kabeli.cl');

    const result = (await useCase.execute({ today: '2026-10-23', dryRun: false, onlyOnLastBusinessDay: false })).unwrap();

    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(sender.supportBillingDigests.map((d) => d.recipientEmail)).toEqual(['pmo@kabeli.cl']);
  });
});
