import { describe, expect, it, vi } from 'vitest';
import {
  projects, projectModules, projectModuleSegments, projectModuleDeliveries,
  projectTeams, quotationEvents,
  type Database,
} from '@kora/db';
import { DrizzleApprovedProjectCalendar } from './drizzle-approved-project-calendar';

const projectId = 'b1a6e0d9-38d0-46cd-a950-6d274bfa116b';
const moduleId = 'd9def70f-5b49-4309-8ed2-174bc57c5f16';
const teamId = '916877e8-5d1f-4590-a707-a6e49c74c1d6';
const versionId = '33bc7a8c-a2a9-46e9-b483-4b18fc4e1ea5';

function fixture(options: {
  active?: boolean;
  transferred?: boolean;
  existingSegment?: boolean;
  existingDates?: boolean;
} = {}) {
  const project = {
    id: projectId, type: 'development', status: options.active === false ? 'draft' : 'active',
    startDate: new Date('2026-11-05T00:00:00.000Z'),
  };
  const draft = {
    mode: 'phases', teams: [{
      teamId, collaborators: 1, unit: 'week', duration: 5,
      hoursPerWeek: 40, dedicationPercent: 100,
    }],
    phases: [{
      name: 'S1: Diseño UX', startWeek: 3, durationWeeks: 5,
      teamHours: [{ teamId, hours: 160 }],
    }],
  };
  const source = options.transferred === false ? null : {
    versionId, draft, transfer: { moduleIds: [moduleId] },
  };
  const modules = [{
    id: moduleId, name: 'S1: Diseño UX',
    estimatedStartDate: options.existingDates ? new Date('2026-11-01T00:00:00.000Z') : null,
    estimatedEndDate: options.existingDates ? new Date('2026-12-01T00:00:00.000Z') : null,
  }];
  const segments: Array<{
    moduleId: string; teamId: string; startDate: Date; endDate: Date;
  }> = options.existingSegment ? [{
    moduleId, teamId, startDate: new Date('2026-11-10T00:00:00.000Z'),
    endDate: new Date('2026-12-01T00:00:00.000Z'),
  }] : [];
  const inserts: Array<{ table: unknown; value: Record<string, unknown> }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const persistedEvents: Array<Record<string, unknown>> = [];
  const tableRows = (table: unknown, projection: Record<string, unknown>) => {
    if (table === projects) return [project];
    if (table === quotationEvents) {
      return 'versionId' in projection ? (source ? [source] : [])
        : persistedEvents.filter((event) => event.action === 'roadmap_calendar_materialized')
          .map((_event) => ({ id: 'event-new' }));
    }
    if (table === projectModules) return modules;
    if (table === projectTeams) return [{ id: teamId, name: 'UX' }];
    if (table === projectModuleSegments) return segments;
    return [];
  };
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn((projection: Record<string, unknown>) => ({
      from(table: unknown) {
        const rows = tableRows(table, projection);
        const query = {
          innerJoin() { return query; },
          where() { return query; },
          orderBy() { return query; },
          limit() { return Promise.resolve(rows); },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) {
            return Promise.resolve(rows).then(onFulfilled, onRejected);
          },
        };
        return query;
      },
    })),
    insert: vi.fn((table: unknown) => ({
      values(value: Record<string, unknown>) {
        inserts.push({ table, value });
        if (table === quotationEvents) persistedEvents.push(value);
        if (table === projectModuleSegments) {
          segments.push({
            moduleId: String(value.moduleId), teamId: String(value.teamId),
            startDate: value.startDate as Date, endDate: value.endDate as Date,
          });
        }
        return {
          returning() { return Promise.resolve([{ id: 'segment-auto' }]); },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) {
            return Promise.resolve(undefined).then(onFulfilled, onRejected);
          },
        };
      },
    })),
    update: vi.fn((_table: unknown) => ({
      set(value: Record<string, unknown>) {
        updates.push(value);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    })),
  };
  const db = { transaction: (callback: (tx: unknown) => Promise<boolean>) =>
    callback(tx) } as unknown as Database;
  return {
    calendar: new DrizzleApprovedProjectCalendar(db),
    inserts, updates, persistedEvents, segments, tx,
  };
}

describe('Materializar cronograma de cotización aprobada (sin segunda aprobación)', () => {
  it('convierte semanas en segmentos y entregas reales una sola vez', async () => {
    const fx = fixture();
    expect(await fx.calendar.ensure(projectId)).toBe(true);
    const createdBlock = fx.inserts.find((item) => item.table === projectModuleSegments)?.value;
    expect(createdBlock).toMatchObject({
      moduleId, teamId, name: 'S1: Diseño UX', estimatedHours: '160.00',
      startDate: new Date('2026-11-19T00:00:00.000Z'),
      endDate: new Date('2026-12-23T00:00:00.000Z'),
    });
    expect(fx.inserts.find((item) => item.table === projectModuleDeliveries)?.value)
      .toMatchObject({
        moduleId, teamId, segmentId: 'segment-auto', status: 'planned',
        estimatedDate: new Date('2026-12-23T00:00:00.000Z'),
      });
    expect(fx.updates[0]).toMatchObject({
      estimatedStartDate: new Date('2026-11-19T00:00:00.000Z'),
      estimatedEndDate: new Date('2026-12-23T00:00:00.000Z'),
    });
    expect(fx.persistedEvents).toHaveLength(1);
    expect(fx.persistedEvents[0]?.action).toBe('roadmap_calendar_materialized');
    expect(await fx.calendar.ensure(projectId)).toBe(false);
    expect(fx.inserts.filter((item) => item.table === projectModuleSegments)).toHaveLength(1);
    expect(fx.inserts.filter((item) => item.table === projectModuleDeliveries)).toHaveLength(1);
  });

  it('respeta las fechas editadas y los segmentos creados por el PM', async () => {
    const fx = fixture({ existingSegment: true, existingDates: true });
    expect(await fx.calendar.ensure(projectId)).toBe(false);
    expect(fx.inserts.filter((item) => item.table === projectModuleSegments)).toHaveLength(0);
    expect(fx.inserts.filter((item) => item.table === projectModuleDeliveries)).toHaveLength(0);
    expect(fx.updates).toHaveLength(0);
    expect(fx.persistedEvents).toHaveLength(1);
    expect(await fx.calendar.ensure(projectId)).toBe(false);
  });

  it('no genera cronograma antes de iniciar ni sin traspaso comercial', async () => {
    for (const options of [{ active: false }, { transferred: false }]) {
      const fx = fixture(options);
      expect(await fx.calendar.ensure(projectId)).toBe(false);
      expect(fx.inserts).toHaveLength(0);
    }
  });
});
