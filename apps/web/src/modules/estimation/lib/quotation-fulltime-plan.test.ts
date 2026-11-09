import { describe, expect, it } from 'vitest';
import { effectiveQuotationEdt, quotationDraftDataSchema } from '@kora/contracts';
import { replanQuotationEdtForWorkforce } from './quotation-fulltime-plan';

const dev = '0777e456-fd76-445e-83f1-afc25061c101';
const lead = '0777e456-fd76-445e-83f1-afc25061c102';
const project = '0777e456-fd76-445e-83f1-afc25061c103';

function fixture(collaborators = 2) {
  return quotationDraftDataSchema.parse({
    mode: 'phases',
    teams: [
      { teamId: dev, collaborators, unit: 'week', duration: 8,
        hoursPerWeek: 20, dedicationPercent: 50 },
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

  it('con cuatro devs reduce implementación a dos semanas sin modificar sus 320 HH', () => {
    const plan = replanQuotationEdtForWorkforce(fixture(4));
    expect(plan.edtStageSettings?.find((s) => s.stageCode === 'DEV')?.durationWeeks)
      .toBe(2);
    expect(effectiveQuotationEdt(plan)?.modules[0]?.tasks[0]?.hours).toBe(320);
    expect(effectiveQuotationEdt(plan)?.totalHours).toBe(330);
  });
});
