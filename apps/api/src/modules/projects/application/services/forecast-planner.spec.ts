import { describe, expect, it } from 'vitest';
import { planSegmentForecast, planTaskForecast } from './forecast-planner';

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

describe('planTaskForecast', () => {
  const base = {
    teamMemberId: 'm1',
    nonWorkingDates: [] as Date[],
    coveredRanges: [] as { start: Date; end: Date }[],
    completedAt: null,
  };
  const rows = (weeks: ReturnType<typeof planTaskForecast>) => weeks.map((w) => [iso(w.periodStart), w.assignedHours]);

  it('reparte las HH en partes iguales entre los días hábiles de inicio a fecha límite', () => {
    // Mié 14-10 → mié 21-10: 3 días + 3 días hábiles, 12 h ⇒ 2 h por día.
    const weeks = planTaskForecast({ ...base, startDate: d('2026-10-14'), endDate: d('2026-10-21'), estimatedHours: 12 });
    expect(rows(weeks)).toEqual([
      ['2026-10-12', 6],
      ['2026-10-19', 6],
    ]);
  });

  it('no reparte en feriados', () => {
    // Lun 12-10 es feriado: quedan 4 días hábiles para 8 h.
    const weeks = planTaskForecast({
      ...base,
      startDate: d('2026-10-12'),
      endDate: d('2026-10-16'),
      estimatedHours: 8,
      nonWorkingDates: [d('2026-10-12')],
    });
    expect(rows(weeks)).toEqual([['2026-10-12', 8]]);
  });

  it('no suma los días que ya cubre un tramo de la persona', () => {
    // 10 días hábiles, 20 h ⇒ 2 h por día; el tramo cubre la primera semana completa.
    const weeks = planTaskForecast({
      ...base,
      startDate: d('2026-10-05'),
      endDate: d('2026-10-16'),
      estimatedHours: 20,
      coveredRanges: [{ start: d('2026-10-01'), end: d('2026-10-09') }],
    });
    expect(rows(weeks)).toEqual([['2026-10-12', 10]]);
  });

  it('libera las semanas posteriores a la semana en que se terminó', () => {
    const weeks = planTaskForecast({
      ...base,
      startDate: d('2026-10-05'),
      endDate: d('2026-10-23'),
      estimatedHours: 30,
      completedAt: d('2026-10-14'),
    });
    expect(rows(weeks)).toEqual([
      ['2026-10-05', 10],
      ['2026-10-12', 10],
    ]);
  });

  it('una tarea sin días hábiles lleva todas sus HH a la semana de su fecha límite', () => {
    const weeks = planTaskForecast({ ...base, startDate: d('2026-10-10'), endDate: d('2026-10-10'), estimatedHours: 4 });
    expect(rows(weeks)).toEqual([['2026-10-05', 4]]);
  });

  it('devuelve vacío sin HH o con el rango invertido', () => {
    expect(planTaskForecast({ ...base, startDate: d('2026-10-05'), endDate: d('2026-10-09'), estimatedHours: 0 })).toEqual([]);
    expect(planTaskForecast({ ...base, startDate: d('2026-10-09'), endDate: d('2026-10-05'), estimatedHours: 5 })).toEqual([]);
  });
});
