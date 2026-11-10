import { describe, expect, it } from 'vitest';
import { effectiveQuotationEdt, quotationDraftDataSchema, reconcilePocCommercialDraft, withQuotationEdtStageSetting } from '@kora/contracts';
import { replanQuotationEdtForWorkforce } from './quotation-fulltime-plan';

const dev = '0777e456-fd76-445e-83f1-afc25061c101';
const lead = '0777e456-fd76-445e-83f1-afc25061c102';
const project = '0777e456-fd76-445e-83f1-afc25061c103';

function fixture(collaborators = 2) {
  return quotationDraftDataSchema.parse({
    mode: 'phases',
    teams: [
      { teamId: dev, collaborators, unit: 'week', duration: 8,
        hoursPerWeek: 40, dedicationPercent: 100 },
      { teamId: lead, collaborators: 1, unit: 'week', duration: 8,
        hoursPerWeek: 5, dedicationPercent: 100 },
    ],
    aiPoc: {
      source: 'drive', answers: [],
      roleTeamIds: { Desarrollo: dev, 'Líder Técnico': lead },
      proposal: {
        projectId: project, provider: 'gemini', sourceMode: 'drive',
        documentsAnalyzed: 1, summary: 'Aplicación de prueba',
        roles: [
          { role: 'Desarrollo', unit: 'week', duration: 8,
            hoursPerUnit: 20, people: 2, totalHours: 320 },
          { role: 'Líder Técnico', unit: 'week', duration: 8,
            hoursPerUnit: 5, people: 1, totalHours: 40 },
        ],
        totalHours: 360, assumptions: [], clarifyingQuestions: [],
      },
      edt: {
        schemaVersion: 'kora.quotation.reference-edt.v2',
        source: 'drive', provider: 'gemini',
        totalHours: 360, reservePercent: 0,
        reserveHours: 0, totalWithReserve: 360,
        stages: [
          { code: 'DEV', name: 'Implementación', startWeek: 1,
            durationWeeks: 8, totalHours: 320 },
          { code: 'TL-GOV', name: 'Supervisión técnica', startWeek: 1,
            durationWeeks: 8, totalHours: 40 },
        ],
        modules: [
          { name: 'Aplicación', totalHours: 320, tasks: [
            { wbs: 'DEV.01', name: 'Construir aplicación',
              role: 'Desarrollo', hours: 320, stageCode: 'DEV',
              roleEffort: [{ role: 'Desarrollo', hours: 320 }] },
          ] },
          { name: 'Gobierno técnico', totalHours: 40, tasks: [
            { wbs: 'TL-GOV.01', name: 'Supervisar avances',
              role: 'Líder Técnico', hours: 40, stageCode: 'TL-GOV',
              roleEffort: [{ role: 'Líder Técnico', hours: 40 }] },
          ] },
        ],
      },
    },
  });
}

const qa = '0777e456-fd76-445e-83f1-afc25061c104';

/** Reproduce el caso 12 -> 11 -> 11 con la implementación anterior:
 * cuatro tramos superpuestos y dos equipos con cargas distintas. */
function overlappingFixture() {
  const draft = fixture(3);
  const snapshot = draft.aiPoc!;
  draft.teams.push({
    teamId: qa, collaborators: 1, unit: 'week', duration: 12,
    hoursPerWeek: 40, dedicationPercent: 100,
  });
  snapshot.roleTeamIds.QA = qa;
  snapshot.proposal.roles = [
    { role: 'Desarrollo', unit: 'week', duration: 23, hoursPerUnit: 40,
      people: 1, totalHours: 920 },
    { role: 'QA', unit: 'week', duration: 13, hoursPerUnit: 20,
      people: 1, totalHours: 260 },
    { role: 'Líder Técnico', unit: 'week', duration: 16, hoursPerUnit: 5,
      people: 1, totalHours: 80 },
  ];
  snapshot.proposal.totalHours = 1260;
  const source = snapshot.edt!;
  const loads = [
    { code: 'S0', startWeek: 3, durationWeeks: 12, developer: 120, testing: 260 },
    { code: 'S1', startWeek: 9, durationWeeks: 4, developer: 200, testing: 0 },
    { code: 'S2', startWeek: 10, durationWeeks: 7, developer: 360, testing: 0 },
    { code: 'S3', startWeek: 3, durationWeeks: 10, developer: 240, testing: 0 },
  ];
  source.stages = [
    ...loads.map((row) => ({
      code: row.code, name: row.code, startWeek: row.startWeek,
      durationWeeks: row.durationWeeks, totalHours: row.developer + row.testing,
    })),
    { code: 'TL-GOV', name: 'Supervisión técnica', startWeek: 1,
      durationWeeks: 16, totalHours: 80 },
  ];
  source.modules = [
    ...loads.map((row) => ({
      name: row.code, totalHours: row.developer + row.testing,
      tasks: [{
        wbs: row.code + '.01', name: 'Implementar ' + row.code,
        role: 'Desarrollo', hours: row.developer + row.testing,
        stageCode: row.code,
        roleEffort: [
          { role: 'Desarrollo', hours: row.developer },
          ...(row.testing ? [{ role: 'QA', hours: row.testing }] : []),
        ],
      }],
    })),
    { name: 'Gobierno técnico', totalHours: 80, tasks: [
      { wbs: 'TL-GOV.01', name: 'Supervisar avances',
        role: 'Líder Técnico', hours: 80, stageCode: 'TL-GOV',
        roleEffort: [{ role: 'Líder Técnico', hours: 80 }] },
    ] },
  ];
  source.totalHours = 1260;
  source.totalWithReserve = 1260;
  return quotationDraftDataSchema.parse(draft);
}

const horizonOf = (draft: ReturnType<typeof overlappingFixture>) =>
  Math.max(...(draft.edtStageSettings ?? []).map((stage) =>
    stage.startWeek + stage.durationWeeks - 1));

function withDevPeople(draft: ReturnType<typeof overlappingFixture>, people: number) {
  return { ...draft, teams: draft.teams.map((team) =>
    team.teamId === dev ? { ...team, collaborators: people } : team) };
}

describe('Planificación IA con dotación a 40 HH/semana', () => {
  it('dos devs convierten 320 HH de 8 semanas en 4; conserva la EDT original', () => {
    const original = fixture();
    const plan = replanQuotationEdtForWorkforce(original);
    expect(plan.edtStageSettings?.find((s) => s.stageCode === 'DEV'))
      .toMatchObject({ startWeek: 1, durationWeeks: 4 });
    expect(plan.edtStageSettings?.find((s) => s.stageCode === 'TL-GOV'))
      .toMatchObject({ startWeek: 1, durationWeeks: 4 });
    expect(plan.edtHourAdjustments).toContainEqual({
      wbs: 'TL-GOV.01', role: 'Líder Técnico', hours: 20,
    });
    expect(plan.aiPoc?.edt).toEqual(original.aiPoc?.edt);
    expect(effectiveQuotationEdt(plan)?.totalHours).toBe(340);
    expect(plan.teams.every((team) => team.dedicationPercent === 100)).toBe(true);
  });

  it('respeta una jornada editada a 20 HH/sem y extiende el plazo sin duplicar HH', () => {
    const draft = fixture();
    draft.teams[0]!.hoursPerWeek = 20;
    draft.teams[0]!.dedicationPercent = 50;
    draft.edtCapacityCustomizedTeamIds = [dev];
    const plan = replanQuotationEdtForWorkforce(draft);
    expect(plan.edtStageSettings?.find((s) => s.stageCode === 'DEV')?.durationWeeks)
      .toBe(8);
    expect(plan.teams[0]).toMatchObject({ hoursPerWeek: 20, dedicationPercent: 50 });
    expect(effectiveQuotationEdt(plan)?.totalHours).toBe(360);
  });

  it('3 -> 4 -> 3 colaboradores recupera 12 semanas (no conserva 11) con tramos superpuestos', () => {
    const source = overlappingFixture();
    const three = reconcilePocCommercialDraft(replanQuotationEdtForWorkforce(source));
    const four = reconcilePocCommercialDraft(
      replanQuotationEdtForWorkforce(withDevPeople(three, 4)));
    const back = reconcilePocCommercialDraft(
      replanQuotationEdtForWorkforce(withDevPeople(four, 3)));
    expect([horizonOf(three), horizonOf(four), horizonOf(back)]).toEqual([12, 11, 12]);
    expect(back.edtStageSettings?.filter((s) => s.stageCode !== 'TL-GOV'))
      .toEqual(three.edtStageSettings?.filter((s) => s.stageCode !== 'TL-GOV'));
    expect(back.aiPoc?.edt).toEqual(source.aiPoc?.edt);
    const originalWbs = source.aiPoc!.edt!.modules.flatMap((module) =>
      module.tasks.filter((task) => task.wbs !== 'TL-GOV.01')
        .map((task) => [task.wbs, task.hours]));
    for (const draft of [three, four, back]) {
      expect(effectiveQuotationEdt(draft)!.modules.flatMap((module) =>
        module.tasks.filter((task) => task.wbs !== 'TL-GOV.01')
          .map((task) => [task.wbs, task.hours]))).toEqual(originalWbs);
    }
    // También después de serializar/restaurar el snapshot de una revisión.
    const persisted = quotationDraftDataSchema.parse(JSON.parse(JSON.stringify(back)));
    expect(horizonOf(replanQuotationEdtForWorkforce(withDevPeople(persisted, 4)))).toBe(11);
  });

  it('una edición manual de fechas permanece como referencia al cambiar dotación varias veces', () => {
    const base = overlappingFixture();
    const three = reconcilePocCommercialDraft(replanQuotationEdtForWorkforce(base));
    const manual = withQuotationEdtStageSetting(three, 'S2', {
      startWeek: 10, durationWeeks: 8,
    });
    expect(manual.edtWorkforceReferenceStages?.find((s) => s.stageCode === 'S2'))
      .toMatchObject({ startWeek: 10, durationWeeks: 8 });
    expect(manual.edtWorkforceReferenceStages?.find((s) => s.stageCode === 'S0'))
      .toMatchObject({ startWeek: 3, durationWeeks: 12 });
    const atThree = reconcilePocCommercialDraft(
      replanQuotationEdtForWorkforce(manual));
    const atFour = reconcilePocCommercialDraft(
      replanQuotationEdtForWorkforce(withDevPeople(atThree, 4)));
    const restored = replanQuotationEdtForWorkforce(withDevPeople(atFour, 3));
    expect(restored.edtStageSettings).toEqual(atThree.edtStageSettings);
    expect(restored.edtWorkforceReferenceStages).toEqual(manual.edtWorkforceReferenceStages);
    expect(withQuotationEdtStageSetting(restored, 'S2', { name: 'Fase renombrada' })
      .edtWorkforceReferenceStages).toEqual(manual.edtWorkforceReferenceStages);
  });

  it('con cuatro devs reduce implementación a dos semanas sin modificar sus 320 HH', () => {
    const plan = replanQuotationEdtForWorkforce(fixture(4));
    expect(plan.edtStageSettings?.find((s) => s.stageCode === 'DEV')?.durationWeeks)
      .toBe(2);
    expect(effectiveQuotationEdt(plan)?.modules[0]?.tasks[0]?.hours).toBe(320);
    expect(effectiveQuotationEdt(plan)?.totalHours).toBe(330);
  });
});
