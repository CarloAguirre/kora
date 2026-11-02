import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from './quotation.contract';
import {
  projectPocRolesToQuotationDraft,
  validatePocDraftIntegrity,
} from './quotation-poc-projection';

const t1 = '0777e456-fd76-445e-83f1-afc25061c105';
const t2 = '0777e456-fd76-445e-83f1-afc25061c106';
const original = () => quotationDraftDataSchema.parse({
  mode: 'phases',
  sourceRefs: ['demo:kdm_fixture'],
  answers: { F01: 'mvp', F02: '8 semanas' },
  assumptions: ['Cliente aporta ambientes'],
  aiPoc: {
    source: 'kdm_demo',
    answers: [
      { questionId: 'F01', value: 'mvp', usedAssumption: false },
      { questionId: 'F02', value: '8 semanas', usedAssumption: false },
    ],
    dynamicQuestions: [],
    proposal: {
      projectId: '0777e456-fd76-445e-83f1-afc25061c101',
      provider: 'gemini',
      sourceMode: 'poc_simulated',
      documentsAnalyzed: 1,
      summary: 'Análisis KDM de ejemplo',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 2, hoursPerUnit: 20,
          people: 1, totalHours: 40, source: 'KDM' },
        { role: 'QA', unit: 'day', duration: 5, hoursPerUnit: 8,
          people: 1, totalHours: 40, source: 'KDM' },
      ],
      totalHours: 80,
      assumptions: ['Cliente aporta ambientes'],
      clarifyingQuestions: [],
    },
    roleTeamIds: {},
  },
});

describe('Proyección IA Gemini KDM a cotización', () => {
  it('conserva 80 HH, incluso si dos roles usan el mismo equipo Kora', () => {
    const draft = original();
    const before = structuredClone(draft);
    const mapped = projectPocRolesToQuotationDraft(draft, { Desarrollo: t1, QA: t1 });
    expect(mapped.mode).toBe('phases');
    expect(mapped.teams).toHaveLength(1);
    expect(mapped.phases).toHaveLength(2);
    expect(mapped.phases.map((phase) => phase.teamHours[0]?.hours)).toEqual([40, 40]);
    expect(mapped.phases.every((phase) => phase.teamHours[0]?.teamId === t1)).toBe(true);
    expect(mapped.aiPoc?.proposal.totalHours).toBe(80);
    expect(mapped.analysisProjectionStatus).toBe('synced');
    expect(() => validatePocDraftIntegrity(draft, mapped)).not.toThrow();
    expect(draft).toEqual(before);
  });

  it('permite mapear distintos equipos sin perder duración original por perfil', () => {
    const mapped = projectPocRolesToQuotationDraft(original(), { Desarrollo: t1, QA: t2 });
    expect(mapped.teams).toHaveLength(2);
    expect(mapped.phases[0]?.durationWeeks).toBe(2);
    expect(mapped.phases[1]?.durationWeeks).toBe(1);
    expect(mapped.phases[0]?.teamHours[0]?.teamId).toBe(t1);
    expect(mapped.phases[1]?.teamHours[0]?.teamId).toBe(t2);
  });

  it('rechaza perfiles incompletos, duplicados o IDs inválidos', () => {
    expect(() => projectPocRolesToQuotationDraft(original(), { Desarrollo: t1 }))
      .toThrow(/todos los perfiles/i);
    expect(() => projectPocRolesToQuotationDraft(original(), { Desarrollo: t1, QA: 'inventado' }))
      .toThrow();
    expect(() => projectPocRolesToQuotationDraft(original(), {
      Desarrollo: t1, QA: t2, Extra: t1,
    })).toThrow(/perfiles/i);
  });

  it('bloquea manipulación de evidencia, respuestas y HH sin revisión explícita', () => {
    const draft = original();
    const mapped = projectPocRolesToQuotationDraft(draft, { Desarrollo: t1, QA: t2 });
    const spoof = structuredClone(mapped);
    if (!spoof.aiPoc) throw new Error('Sin evidencia de prueba.');
    spoof.aiPoc.proposal.summary = 'Otro proyecto';
    expect(() => validatePocDraftIntegrity(draft, spoof)).toThrow(/evidencia/i);

    const moved = structuredClone(mapped);
    moved.phases[0]!.teamHours[0]!.hours = 200;
    expect(() => validatePocDraftIntegrity(draft, moved)).toThrow(/proyección/i);
    expect(() => validatePocDraftIntegrity(mapped, moved)).toThrow(/HH cambiaron/i);
    moved.analysisProjectionStatus = 'modified';
    expect(() => validatePocDraftIntegrity(mapped, moved)).not.toThrow();
  });

  it('proyecta tramos Zurich-style en lugar de crear fases por perfil, sin duplicar HH', () => {
    const draft = original();
    const edt = {
      schemaVersion: 'kora.quotation.reference-edt.v2' as const,
      source: 'kdm_demo' as const, provider: 'gemini' as const,
      totalHours: 80, reservePercent: 10, reserveHours: 8, totalWithReserve: 88,
      stages: [
        { code: 'T01', name: 'Diseño y base', startWeek: 1, durationWeeks: 2, totalHours: 50 },
        { code: 'T02', name: 'Pruebas y entrega', startWeek: 2, durationWeeks: 2, totalHours: 30 },
      ],
      modules: [{
        name: 'Portal', totalHours: 80, tasks: [
          { wbs: 'T01.01', name: 'Implementación',
            description: 'React y servicios', role: 'Desarrollo', hours: 50,
            stageCode: 'T01',
            roleEffort: [{ role: 'Desarrollo', hours: 30 }, { role: 'QA', hours: 20 }] },
          { wbs: 'T02.01', name: 'Regresión',
            description: 'UAT', role: 'QA', hours: 30,
            stageCode: 'T02',
            roleEffort: [{ role: 'Desarrollo', hours: 10 }, { role: 'QA', hours: 20 }] },
        ],
      }],
    };
    const detailed = quotationDraftDataSchema.parse({
      ...draft, aiPoc: { ...draft.aiPoc!, edt },
    });
    const result = projectPocRolesToQuotationDraft(detailed, {
      Desarrollo: t1, QA: t2,
    });
    expect(result.mode).toBe('phases');
    expect(result.phases).toEqual([
      { name: 'T01 · Diseño y base', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: t1, hours: 30 }, { teamId: t2, hours: 20 }] },
      { name: 'T02 · Pruebas y entrega', startWeek: 2, durationWeeks: 2,
        teamHours: [{ teamId: t1, hours: 10 }, { teamId: t2, hours: 20 }] },
    ]);
    expect(result.phases.flatMap((phase) => phase.teamHours)
      .reduce((total, row) => total + row.hours, 0)).toBe(80);
    expect(result.aiPoc?.edt?.reserveHours).toBe(8);
    expect(result.aiPoc?.proposal.totalHours).toBe(80);
    expect(() => validatePocDraftIntegrity(detailed, result)).not.toThrow();
    expect(edt.totalWithReserve).toBe(88); // No se suma a las HH base.
  });

  it('impide borrar evidencia IA o reemplazar fuentes en una versión ya guardada', () => {
    const draft = original();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, aiPoc: null })).toThrow();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, sourceRefs: [] })).toThrow();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, answers: {} })).toThrow();
  });
});
