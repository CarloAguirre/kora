import { describe, expect, it } from 'vitest';
import type { TeamReportProject, TeamReportResponse } from '@kora/contracts';
import { buildReportRows, participationState, periodRange, sumReportRows } from './team-report';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

function project(overrides: Partial<TeamReportProject> = {}): TeamReportProject {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    name: 'AurelIA - SPR',
    slug: 'aurelia-spr',
    client: null,
    status: 'active',
    salesStage: 'approved',
    startDate: '2026-06-01',
    endDate: '2026-09-30',
    assignedHours: 130,
    responsible: null,
    projectLeader: null,
    hours: [],
    teamTasks: { total: 0, approved: 0 },
    teamDeliveryApproved: false,
    comment: null,
    dataRequestedAt: null,
    ...overrides,
  };
}

function report(projects: TeamReportProject[]): TeamReportResponse {
  return {
    teamId: '00000000-0000-4000-8000-0000000000ff',
    teamName: 'UX',
    dateFrom: '2026-01-01',
    dateTo: '2026-10-16',
    members: [],
    projects,
  };
}

describe('participationState', () => {
  it('prioriza el estado del proyecto en Kora sobre las tareas', () => {
    expect(participationState(project({ status: 'on_hold', teamTasks: { total: 8, approved: 5 } }), 10).status).toBe('on_hold');
    expect(participationState(project({ status: 'finished' }), 0).status).toBe('finished');
  });

  it('con tareas: todas aprobadas → Terminado; entrega aprobada → Ok cliente; avance → En proceso', () => {
    expect(participationState(project({ teamTasks: { total: 4, approved: 4 } }), 0).status).toBe('finished');
    expect(
      participationState(
        project({
          teamTasks: { total: 10, approved: 7 },
          teamDeliveryApproved: true,
        }),
        0,
      ).status,
    ).toBe('client_ok');
    expect(participationState(project({ teamTasks: { total: 6, approved: 0 } }), 3).status).toBe('in_progress');
    expect(participationState(project({ teamTasks: { total: 6, approved: 0 } }), 0).status).toBe('not_started');
  });

  it('sin tareas: depende de si el equipo registró HH', () => {
    expect(participationState(project(), 5).status).toBe('in_progress');
    expect(participationState(project(), 0).status).toBe('not_started');
  });
});

describe('buildReportRows', () => {
  const hours = [
    {
      userId: USER_A,
      periodApproved: 2,
      periodPending: 1.5,
      accumulatedApproved: 10,
      accumulatedPending: 1.5,
    },
    {
      userId: USER_B,
      periodApproved: 120,
      periodPending: 0,
      accumulatedApproved: 125,
      accumulatedPending: 0,
    },
  ];

  it('calcula total del período y saldo acumulado contra lo asignado', () => {
    const [row] = buildReportRows(report([project({ hours })]), false);
    expect(row!.total).toBe(122);
    expect(row!.accumulated).toBe(135);
    expect(row!.balance).toBe(-5);
    expect(row!.pendingByUser.size).toBe(0);
  });

  it('suma las pendientes al período y al acumulado si se pide', () => {
    const [row] = buildReportRows(report([project({ hours })]), true);
    expect(row!.hoursByUser.get(USER_A)).toBe(3.5);
    expect(row!.total).toBe(123.5);
    expect(row!.balance).toBe(-6.5);
    expect(row!.pendingByUser.get(USER_A)).toBe(1.5);
  });

  it('marca HH sin asignar y fechas faltantes', () => {
    const [row] = buildReportRows(report([project({ hours, assignedHours: null, endDate: null })]), false);
    expect(row!.missingAssigned).toBe(true);
    expect(row!.missingDates).toBe(true);
  });

  it('cuenta las HH por aprobar aunque no se muestren las pendientes', () => {
    const pendingOnly = [{ userId: USER_A, periodApproved: 0, periodPending: 2, accumulatedApproved: 0, accumulatedPending: 2 }];
    const [row] = buildReportRows(report([project({ hours: pendingOnly, assignedHours: null, endDate: null })]), false);
    expect(row!.missingAssigned).toBe(true);
    expect(row!.missingDates).toBe(true);
  });

  it('no marca datos faltantes en prospectos ni en proyectos sin horas del equipo', () => {
    const rows = buildReportRows(
      report([
        project({ hours, assignedHours: null, endDate: null, salesStage: 'prospect' }),
        project({ hours: [], assignedHours: null, endDate: null }),
      ]),
      false,
    );
    expect(rows.map((row) => [row.missingAssigned, row.missingDates])).toEqual([
      [false, false],
      [false, false],
    ]);
  });

  it('totaliza por persona', () => {
    const rows = buildReportRows(
      report([
        project({ hours }),
        project({
          projectId: '00000000-0000-4000-8000-000000000002',
          hours,
          assignedHours: 0,
        }),
      ]),
      false,
    );
    const totals = sumReportRows(rows);
    expect(totals.byUser.get(USER_B)).toBe(240);
    expect(totals.assigned).toBe(130);
    expect(totals.balance).toBe(130 - 270);
  });
});

describe('periodRange', () => {
  it('arma los rangos de cada preset', () => {
    expect(periodRange('accumulated', '2026-10-16')).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-10-16',
    });
    expect(periodRange('this_month', '2026-10-16')).toEqual({
      dateFrom: '2026-10-01',
      dateTo: '2026-10-16',
    });
    expect(periodRange('last_month', '2026-03-05')).toEqual({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(periodRange('last_30_days', '2026-10-16')).toEqual({
      dateFrom: '2026-09-17',
      dateTo: '2026-10-16',
    });
  });
});
