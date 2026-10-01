import { describe, expect, it } from 'vitest';
import { planSegmentForecast } from './segment-forecast-planner';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('planSegmentForecast', () => {
  it('reparte el tramo por semana lunes-viernes, prorrateando las semanas incompletas', () => {
    // Jue 01-10-2026 → Vie 16-10-2026: 2 días + 5 días + 5 días.
    const weeks = planSegmentForecast({
      startDate: d('2026-10-01'),
      endDate: d('2026-10-16'),
      members: [{ teamMemberId: 'm1', weeklyHours: 40, dailyPercent: 50 }],
      nonWorkingDates: [],
    });

    expect(weeks.map((w) => [iso(w.periodStart), iso(w.periodEnd), w.assignedHours])).toEqual([
      ['2026-09-28', '2026-10-02', 8],
      ['2026-10-05', '2026-10-09', 20],
      ['2026-10-12', '2026-10-16', 20],
    ]);
  });

  it('no cuenta fines de semana ni feriados', () => {
    const weeks = planSegmentForecast({
      startDate: d('2026-10-05'),
      endDate: d('2026-10-11'),
      members: [{ teamMemberId: 'm1', weeklyHours: 44, dailyPercent: 100 }],
      nonWorkingDates: [d('2026-10-09')],
    });

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.assignedHours).toBe(35.2); // 4 días × 8,8 h
  });

  it('omite colaboradores sin % diario y semanas sin días hábiles', () => {
    const weeks = planSegmentForecast({
      startDate: d('2026-10-03'),
      endDate: d('2026-10-05'),
      members: [
        { teamMemberId: 'sin-porcentaje', weeklyHours: 40, dailyPercent: null },
        { teamMemberId: 'm2', weeklyHours: 40, dailyPercent: 25 },
      ],
      nonWorkingDates: [],
    });

    // Sáb 03 y dom 04 no generan la semana del 28-09; solo el lunes 05.
    expect(weeks.map((w) => [w.teamMemberId, iso(w.periodStart), w.assignedHours])).toEqual([['m2', '2026-10-05', 2]]);
  });

  it('devuelve vacío si el rango está invertido', () => {
    expect(
      planSegmentForecast({
        startDate: d('2026-10-10'),
        endDate: d('2026-10-01'),
        members: [{ teamMemberId: 'm1', weeklyHours: 40, dailyPercent: 100 }],
        nonWorkingDates: [],
      }),
    ).toEqual([]);
  });
});
