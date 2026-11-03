import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from '@kora/contracts';
import { quotationTeamWeeklyPlan } from './quotation-team-weekly-plan';

const dev = '0777e456-fd76-445e-83f1-afc25061c103';
const qa = '0777e456-fd76-445e-83f1-afc25061c104';
const team = (teamId: string) => ({
  teamId, collaborators: 1, unit: 'week' as const,
  duration: 0, hoursPerWeek: 0, dedicationPercent: 100,
});
const draft = quotationDraftDataSchema.parse({
  mode: 'phases', teams: [team(dev), team(qa)], phases: [],
  aiPoc: {
    source: 'kdm_demo', answers: [], roleTeamIds: { Desarrollo: dev, QA: qa },
    proposal: {
      projectId: '0777e456-fd76-445e-83f1-afc25061c100',
      provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Propuesta',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 3,
          hoursPerUnit: 50, people: 1, totalHours: 50 },
        { role: 'QA', unit: 'week', duration: 2,
          hoursPerUnit: 10, people: 1, totalHours: 10 },
      ], totalHours: 60, assumptions: [], clarifyingQuestions: [],
    },
    edt: {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 60, reservePercent: 0, reserveHours: 0, totalWithReserve: 60,
      stages: [
        { code: 'S1', name: 'Backend', startWeek: 1, durationWeeks: 2, totalHours: 40 },
        { code: 'S2', name: 'QA e integración', startWeek: 2, durationWeeks: 2, totalHours: 20 },
      ],
      modules: [{ name: 'Portal', totalHours: 60, tasks: [
        { wbs: 'S1.01', name: 'API', description: 'Desarrollo',
          role: 'Desarrollo', hours: 40, stageCode: 'S1',
          roleEffort: [{ role: 'Desarrollo', hours: 40 }] },
        { wbs: 'S2.01', name: 'Integración', description: 'Desarrollo',
          role: 'Desarrollo', hours: 10, stageCode: 'S2',
          roleEffort: [{ role: 'Desarrollo', hours: 10 }] },
        { wbs: 'S2.02', name: 'Pruebas', description: 'QA',
          role: 'QA', hours: 10, stageCode: 'S2',
          roleEffort: [{ role: 'QA', hours: 10 }] },
      ] }],
    },
  },
});

describe('Proyección semanal por equipos de la EDT', () => {
  it('suma fases solapadas, semanas activas y HH sin duplicar tareas', () => {
    const plan = quotationTeamWeeklyPlan(draft)!;
    const development = plan.rows.find((row) => row.teamKey === dev)!;
    const testing = plan.rows.find((row) => row.teamKey === qa)!;
    expect(plan.lastWeek).toBe(3);
    expect(plan.totalHours).toBe(60);
    expect(development.totalHours).toBe(50);
    expect(development.activeWeeks).toBe(3);
    expect(development.firstWeek).toBe(1);
    expect(development.lastWeek).toBe(3);
    expect(development.averageHoursPerWeek).toBeCloseTo(50 / 3);
    expect([...development.weeklyHours.values()]).toEqual([20, 25, 5]);
    expect(testing.totalHours).toBe(10);
    expect([...testing.weeklyHours.values()]).toEqual([5, 5]);
    expect([...plan.weekTotals.values()]).toEqual([20, 30, 10]);
  });

  it('concilia centésimos cuando se ajustan HH de una tarea', () => {
    const edited = quotationDraftDataSchema.parse({
      ...draft,
      edtHourAdjustments: [{ wbs: 'S1.01', role: 'Desarrollo', hours: 39.99 }],
    });
    const plan = quotationTeamWeeklyPlan(edited)!;
    const development = plan.rows.find((row) => row.teamKey === dev)!;
    expect(development.totalHours).toBe(49.99);
    expect(development.weeklyHours.get(1)).toBe(20);
    expect(development.weeklyHours.get(2)).toBe(24.99);
    expect(plan.totalHours).toBe(59.99);
    expect([...plan.weekTotals.values()]).toEqual([20, 29.99, 10]);
  });

  it('usa las semanas comerciales editadas y respeta periodos solapados o separados', () => {
    const edited = quotationDraftDataSchema.parse({
      ...draft,
      edtStageSettings: [{
        stageCode: 'S2', name: 'Integración', startWeek: 3, durationWeeks: 2,
      }],
    });
    const plan = quotationTeamWeeklyPlan(edited)!;
    const development = plan.rows.find((row) => row.teamKey === dev)!;
    expect(plan.lastWeek).toBe(4);
    expect(development.activeWeeks).toBe(4);
    expect([...development.weeklyHours.values()]).toEqual([20, 20, 5, 5]);
    expect([...plan.weekTotals.values()]).toEqual([20, 20, 10, 10]);
  });

  it('agrupa por el equipo asignado a cada WBS, incluso si difiere del perfil general', () => {
    const edited = quotationDraftDataSchema.parse({
      ...draft,
      edtTaskSettings: [{ wbs: 'S2.02', role: 'QA', teamId: dev }],
    });
    const plan = quotationTeamWeeklyPlan(edited)!;
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.teamKey).toBe(dev);
    expect(plan.rows[0]?.totalHours).toBe(60);
    expect([...plan.weekTotals.values()]).toEqual([20, 30, 10]);
  });

  it('cambiar colaboradores no recalcula las HH provenientes de actividades WBS', () => {
    const changed = quotationDraftDataSchema.parse({
      ...draft,
      teams: [{ ...team(dev), collaborators: 4 }, { ...team(qa), collaborators: 2 }],
    });
    const original = quotationTeamWeeklyPlan(draft)!;
    const planned = quotationTeamWeeklyPlan(changed)!;
    expect(planned.totalHours).toBe(original.totalHours);
    expect(planned.rows.map((row) => [...row.weeklyHours.values()]))
      .toEqual(original.rows.map((row) => [...row.weeklyHours.values()]));
  });

  it('también usa las fases comerciales manuales sin recalcular HH por capacidad', () => {
    const manual = quotationDraftDataSchema.parse({
      mode: 'phases', teams: [team(dev), team(qa)],
      phases: [
        { name: 'Construcción', startWeek: 2, durationWeeks: 2,
          teamHours: [{ teamId: dev, hours: 20 }] },
        { name: 'QA', startWeek: 3, durationWeeks: 2,
          teamHours: [{ teamId: dev, hours: 10 }, { teamId: qa, hours: 8 }] },
      ],
    });
    const plan = quotationTeamWeeklyPlan(manual)!;
    expect(plan.lastWeek).toBe(4);
    expect(plan.totalHours).toBe(38);
    expect([...plan.rows.find((row) => row.teamKey === dev)!.weeklyHours.values()])
      .toEqual([10, 15, 5]);
    expect([...plan.weekTotals.values()]).toEqual([10, 19, 9]);
    expect(quotationTeamWeeklyPlan(quotationDraftDataSchema.parse({
      mode: 'team', teams: [team(dev)],
    }))).toBeNull();
  });

  it('no inventa semanas para EDT v1 sin calendario explícito', () => {
    const legacy = quotationDraftDataSchema.parse({
      ...draft,
      aiPoc: {
        ...draft.aiPoc!,
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v1',
          source: 'kdm_demo', provider: 'gemini', totalHours: 20,
          modules: [{ name: 'Legacy', totalHours: 20, tasks: [{
            wbs: 'L.01', name: 'API', description: 'Desarrollo',
            role: 'Desarrollo', hours: 20,
          }] }],
        },
      },
    });
    expect(quotationTeamWeeklyPlan(legacy)).toBeNull();
    const planned = quotationDraftDataSchema.parse({
      ...legacy,
      edtStageSettings: [{
        stageCode: 'module:Legacy', name: 'Legacy', startWeek: 3, durationWeeks: 2,
      }],
    });
    const plan = quotationTeamWeeklyPlan(planned)!;
    expect(plan.lastWeek).toBe(4);
    expect([...plan.rows[0]!.weeklyHours.values()]).toEqual([10, 10]);
  });
});
