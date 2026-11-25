import { describe, expect, it } from 'vitest';
import { inferLeanStaffingForEdt, optimizeWorkforceForEdt, replanEdtStagesToFullTime } from './estimation-workforce-optimizer';

describe('dimensionamiento determinístico posterior a EDT', () => {
  it('40 HH en una semana con headcount IA de 5 => un solo colaborador', () => {
    const stages = [{ code: 'DEV', startWeek: 1, durationWeeks: 1 }];
    const hours = [{ stageCode: 'DEV', role: 'Dev', hours: 40 }];
    const staff = inferLeanStaffingForEdt(stages, hours, [
      { role: 'Dev', teamId: 'dev', people: 5 },
      { role: 'Líder Técnico', teamId: 'tl', people: 2 },
    ]);
    expect(staff.map((role) => role.people)).toEqual([1, 1]);
    expect(replanEdtStagesToFullTime(stages, hours, staff)[0])
      .toMatchObject({ startWeek: 1, durationWeeks: 1 });
  });

  it('150 HH QA en ocho semanas => una persona cuatro semanas (93,75%)', () => {
    const stages = [{ code: 'QA', startWeek: 1, durationWeeks: 8 }];
    const effort = [{ stageCode: 'QA', role: 'QA', hours: 150 }];
    const staff = inferLeanStaffingForEdt(stages, effort, [
      { role: 'QA', teamId: 'qa', people: 4 },
    ]);
    expect(staff[0]?.people).toBe(1);
    const result = replanEdtStagesToFullTime(stages, effort, staff);
    expect(result[0]?.durationWeeks).toBe(4);
    const summary = optimizeWorkforceForEdt(result, effort, [
      { role: 'QA', teamId: 'qa' },
    ]);
    expect(summary.totalHours).toBe(150);
    expect(summary.roles[0]?.people).toBe(1);
    expect(summary.roles[0]!.totalHours / (40 * 4)).toBe(0.9375);
  });

  it('dos tramos consecutivos de 20 HH pueden ocupar una semana completa', () => {
    const stages = [{ code: 'A', startWeek: 1, durationWeeks: 1 },
      { code: 'B', startWeek: 2, durationWeeks: 1 }];
    const effort = [{ stageCode: 'A', role: 'Dev', hours: 20 },
      { stageCode: 'B', role: 'Dev', hours: 20 }];
    const result = replanEdtStagesToFullTime(stages, effort, [{ role: 'Dev', people: 1 }]);
    expect(result).toEqual([
      { code: 'A', startWeek: 1, durationWeeks: 1 },
      { code: 'B', startWeek: 1, durationWeeks: 1 },
    ]);
    const plan = optimizeWorkforceForEdt(result, effort, [{ role: 'Dev' }]);
    expect(plan.roles[0]).toMatchObject({
      people: 1, peakWeeklyHours: 40, totalHours: 40,
    });
  });

  it('descarta la compactación si semanas uniformes generarían sobrecarga', () => {
    const effort = [{ stageCode: 'A', role: 'Dev', hours: 20 },
      { stageCode: 'B', role: 'Dev', hours: 80 }];
    const result = replanEdtStagesToFullTime([
      { code: 'A', startWeek: 1, durationWeeks: 1 },
      { code: 'B', startWeek: 2, durationWeeks: 2 },
    ], effort, [{ role: 'Dev', people: 1 }]);
    const plan = optimizeWorkforceForEdt(result, effort, [{ role: 'Dev' }]);
    expect(plan.roles[0]?.people).toBe(1);
    expect(plan.totalHours).toBe(100);
  });


  it('320 HH con 2 devs en 8 semanas se comprimen a 4 sin tocar esfuerzo', () => {
    const stages = replanEdtStagesToFullTime(
      [{ code: 'DEV', startWeek: 1, durationWeeks: 8 }],
      [{ stageCode: 'DEV', role: 'Dev', hours: 320 }],
      [{ role: 'Dev', teamId: 'desarrollo', people: 2 }],
    );
    expect(stages[0]).toEqual({ code: 'DEV', startWeek: 1, durationWeeks: 4 });
    expect(optimizeWorkforceForEdt(stages,
      [{ stageCode: 'DEV', role: 'Dev', hours: 320 }],
      [{ role: 'Dev', teamId: 'desarrollo' }]).totalHours).toBe(320);
  });

  it('reordena ventanas superpuestas y conserva su simultaneidad', () => {
    const stages = replanEdtStagesToFullTime(
      [{ code: 'DEV', startWeek: 1, durationWeeks: 6 },
        { code: 'QA', startWeek: 5, durationWeeks: 4 }],
      [{ stageCode: 'DEV', role: 'Dev', hours: 160 },
        { stageCode: 'QA', role: 'QA', hours: 40 }],
      [{ role: 'Dev', teamId: 'desarrollo', people: 2 },
        { role: 'QA', teamId: 'calidad', people: 1 }],
    );
    expect(stages[0]!.durationWeeks).toBeLessThan(6);
    expect(stages[1]!.startWeek).toBeLessThan(5);
    expect(stages[0]!.startWeek + stages[0]!.durationWeeks - 1)
      .toBeGreaterThanOrEqual(stages[1]!.startWeek);
  });

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
