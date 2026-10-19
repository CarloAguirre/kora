import { describe, expect, it } from 'vitest';
import { coverPlannedHours } from './forecast-planned-coverage';
import type { ForecastAssignmentRawRow } from '../../domain/repositories/forecast-assignment.repository';

const MONDAY = new Date('2026-10-26T00:00:00.000Z');
const row = (assignedHours: number, overrides: Partial<ForecastAssignmentRawRow> = {}): ForecastAssignmentRawRow => ({
  teamMemberId: 'm1',
  periodStart: MONDAY,
  type: 'project',
  projectId: 'p1',
  projectName: 'Proyecto',
  comments: '',
  assignedHours,
  source: 'manual',
  segmentId: null,
  taskId: null,
  isAdjusted: false,
  isStale: false,
  ...overrides,
});
const total = (rows: ForecastAssignmentRawRow[]) => rows.reduce((sum, r) => sum + r.assignedHours, 0);

describe('coverPlannedHours', () => {
  it('un tramo del mismo proyecto sale de lo planificado a mano, no se suma aparte', () => {
    const rows = coverPlannedHours([row(40), row(32, { source: 'segment', segmentId: 's1' })]);

    expect(total(rows)).toBe(40);
    expect(rows.find((r) => r.source === 'manual')?.assignedHours).toBe(8);
  });

  it('si el tramo y la tarea superan lo planificado, solo cuenta lo calculado', () => {
    const rows = coverPlannedHours([
      row(20),
      row(16, { source: 'segment', segmentId: 's1' }),
      row(8, { source: 'task', taskId: 't1' }),
    ]);

    expect(total(rows)).toBe(24);
    expect(rows.some((r) => r.source === 'manual')).toBe(false);
  });

  it('no descuenta de otro proyecto, otra persona u otra semana', () => {
    const rows = coverPlannedHours([
      row(40),
      row(10, { source: 'segment', segmentId: 's1', projectId: 'p2' }),
      row(10, { source: 'segment', segmentId: 's1', teamMemberId: 'm2' }),
      row(10, { source: 'segment', segmentId: 's1', periodStart: new Date('2026-11-02T00:00:00.000Z') }),
    ]);

    expect(total(rows)).toBe(70);
  });

  it('no descuenta de ausencias ni de filas manuales sin proyecto', () => {
    const rows = coverPlannedHours([
      row(8, { type: 'vacation', projectId: null }),
      row(8, { projectId: null }),
      row(20, { source: 'segment', segmentId: 's1' }),
    ]);

    expect(total(rows)).toBe(36);
  });
});
