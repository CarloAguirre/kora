import { describe, expect, it, vi } from 'vitest';
import { PreviewForecastLoadUseCase } from './preview-forecast-load.use-case';
import type { ForecastSourceCalculator, PlannedLoadWeek } from '../ports/forecast-source-calculator.port';
import type { ForecastAssignmentRawRow, ForecastAssignmentRepository } from '../../domain/repositories/forecast-assignment.repository';
import type { ForecastTeamReader } from '../ports/forecast-team-reader.port';
import type { ForecastCapacityService } from '../services/forecast-capacity.service';
import { FixedClock } from '../../../../test/fakes';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// FixedClock = martes 2026-08-25: la semana del 24-08 sigue en curso, la del 17-08 ya terminó.
const week = (monday: string, friday: string, assignedHours: number, teamMemberId = 'm1'): PlannedLoadWeek => ({
  teamMemberId,
  periodStart: d(monday),
  periodEnd: d(friday),
  assignedHours,
});
const row = (monday: string, assignedHours: number, overrides: Partial<ForecastAssignmentRawRow> = {}): ForecastAssignmentRawRow => ({
  teamMemberId: 'm1',
  periodStart: d(monday),
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

function build(planned: PlannedLoadWeek[], existing: ForecastAssignmentRawRow[]) {
  const calculator = {
    previewSegment: vi.fn().mockResolvedValue(planned),
    previewTask: vi.fn().mockResolvedValue(planned),
  } as unknown as ForecastSourceCalculator;
  const assignments = { listRawForWeeks: vi.fn().mockResolvedValue(existing) } as unknown as ForecastAssignmentRepository;
  const teams = {
    findMemberById: vi.fn().mockResolvedValue({ id: 'm1', fullName: 'Carlo Aguirre', weeklyHours: 40, teamId: 't1', teamName: 'Dev', userId: 'u1' }),
  } as unknown as ForecastTeamReader;
  const capacity = {
    businessDayFraction: vi.fn().mockResolvedValue(1),
    capacityHoursFor: (weeklyHours: number, fraction: number) => weeklyHours * fraction,
  } as unknown as ForecastCapacityService;
  return new PreviewForecastLoadUseCase(calculator, assignments, teams, capacity, new FixedClock());
}

const SEGMENT_INPUT = {
  kind: 'segment' as const,
  segmentId: 'seg-1',
  startDate: '2026-08-24',
  endDate: '2026-09-04',
  members: [{ teamMemberId: 'm1', dailyPercent: 50 }],
};

describe('PreviewForecastLoadUseCase', () => {
  it('avisa la semana en que la persona pasaría el 100 %', async () => {
    const useCase = build([week('2026-08-24', '2026-08-28', 20), week('2026-08-31', '2026-09-04', 20)], [row('2026-08-24', 30), row('2026-08-31', 10)]);
    const result = await useCase.execute(SEGMENT_INPUT);

    expect(result.isOk() && result.value.warnings).toEqual([
      expect.objectContaining({ periodStart: '2026-08-24', currentHours: 30, addedHours: 20, totalHours: 50, loadPercent: 125 }),
    ]);
  });

  it('avisa aunque no la pase, si ya estaba al 100 %', async () => {
    const useCase = build([week('2026-08-24', '2026-08-28', 4)], [row('2026-08-24', 40)]);
    const result = await useCase.execute(SEGMENT_INPUT);

    expect(result.isOk() && result.value.warnings.map((w) => w.loadPercent)).toEqual([110]);
  });

  it('no cuenta las filas del mismo tramo que se está editando', async () => {
    const useCase = build([week('2026-08-24', '2026-08-28', 20)], [row('2026-08-24', 20, { source: 'segment', segmentId: 'seg-1' }), row('2026-08-24', 20)]);
    const result = await useCase.execute(SEGMENT_INPUT);

    expect(result.isOk() && result.value.warnings).toEqual([]);
  });

  it('ignora las semanas que ya terminaron', async () => {
    const useCase = build([week('2026-08-17', '2026-08-21', 40)], [row('2026-08-17', 40)]);
    const result = await useCase.execute(SEGMENT_INPUT);

    expect(result.isOk() && result.value.warnings).toEqual([]);
  });
});
