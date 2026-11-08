import { describe, expect, it } from 'vitest';
import { optimizeWorkforceForEdt } from './estimation-workforce-optimizer';

describe('dimensionamiento determinístico posterior a EDT', () => {
  it('100 HH en una semana exige tres personas como PICO, sin crear HH', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 1 }],
      [{ stageCode: 'S1', role: 'Dev', hours: 100 }],
      [{ role: 'Dev', teamId: 'team-dev' }],
    );
    expect(plan.totalHours).toBe(100);
    expect(plan.roles[0]?.people).toBe(3);
    expect(plan.roles[0]?.peakWeeklyHours).toBe(100);
    expect(plan.roles[0]?.fullTimeEquivalentWeeks).toBe(2.5);
    expect(plan.teams[0]?.people).toBe(3);
  });

  it('740 HH distribuidas en ocho semanas requieren tres personas, no tres dedicadas siempre', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 8 }],
      [{ stageCode: 'S1', role: 'Dev', hours: 740 }],
      [{ role: 'Dev', teamId: 'team-dev' }],
    );
    expect(plan.roles[0]?.people).toBe(3);
    expect(plan.roles[0]?.fullTimeEquivalentWeeks).toBe(18.5);
    expect(plan.roles[0]?.peakWeeklyHours).toBe(92.5);
    expect(plan.horizonWeeks).toBe(8);
  });

  it('reduce personal preliminar cuando las HH de la EDT no lo necesitan', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 4 }],
      [{ stageCode: 'S1', role: 'QA', hours: 40 }],
      [{ role: 'QA', teamId: 'team-qa' }],
    );
    expect(plan.roles[0]?.people).toBe(1);
    expect(plan.roles[0]?.activeWeeks).toBe(4);
    expect(plan.roles[0]?.fullTimeEquivalentWeeks).toBe(1);
  });

  it('fases superpuestas se suman semanalmente antes de decidir dotación', () => {
    const plan = optimizeWorkforceForEdt(
      [
        { code: 'A', startWeek: 1, durationWeeks: 2 },
        { code: 'B', startWeek: 2, durationWeeks: 1 },
      ],
      [
        { stageCode: 'A', role: 'Dev', hours: 80 },
        { stageCode: 'B', role: 'Dev', hours: 35 },
      ],
      [{ role: 'Dev', teamId: 'dev' }],
    );
    expect([...plan.roles[0]!.weeklyHours.values()]).toEqual([40, 75]);
    expect(plan.roles[0]?.people).toBe(2);
    expect(plan.totalHours).toBe(115);
  });

  it('el equipo compartido no suma personas de roles si comparten capacidad real', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 1 }],
      [
        { stageCode: 'S1', role: 'Frontend', hours: 20 },
        { stageCode: 'S1', role: 'Backend', hours: 20 },
      ],
      [
        { role: 'Frontend', teamId: 'dev' },
        { role: 'Backend', teamId: 'dev' },
      ],
    );
    expect(plan.roles.map((role) => role.people)).toEqual([1, 1]);
    expect(plan.teams[0]?.people).toBe(1);
    expect(plan.totalHours).toBe(40);
  });

  it('respeta supervisión TL 5 HH por semana y no la transforma en 40 HH', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'TL-GOV', startWeek: 1, durationWeeks: 4 }],
      [{ stageCode: 'TL-GOV', role: 'Líder Técnico', hours: 20 }],
      [{ role: 'Líder Técnico', teamId: 'dev' }],
    );
    expect(plan.roles[0]).toMatchObject({
      people: 1, totalHours: 20, peakWeeklyHours: 5,
    });
    expect(() => optimizeWorkforceForEdt(
      [{ code: 'TL-GOV', startWeek: 1, durationWeeks: 1 }],
      [{ stageCode: 'TL-GOV', role: 'Líder Técnico', hours: 41 }],
      [{ role: 'Líder Técnico', teamId: 'dev' }],
    )).toThrow(/Líder Técnico excede/);
  });

  it('no pierde centésimos al repartir horas entre semanas', () => {
    const plan = optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 3 }],
      [{ stageCode: 'S1', role: 'Dev', hours: 10.01 }],
      [{ role: 'Dev', teamId: 'dev' }],
    );
    expect([...plan.roles[0]!.weeklyHours.values()]).toEqual([3.34, 3.34, 3.33]);
    expect(plan.roles[0]?.totalHours).toBe(10.01);
  });

  it('rechaza etapas o HH inválidas en vez de corregirlas inventando esfuerzos', () => {
    expect(() => optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 520, durationWeeks: 2 }],
      [{ stageCode: 'S1', role: 'Dev', hours: 1 }],
      [{ role: 'Dev' }],
    )).toThrow(/calendario/);
    expect(() => optimizeWorkforceForEdt(
      [{ code: 'S1', startWeek: 1, durationWeeks: 1 }],
      [{ stageCode: 'S1', role: 'Dev', hours: 1.234 }],
      [{ role: 'Dev' }],
    )).toThrow(/precisión/);
  });
});
