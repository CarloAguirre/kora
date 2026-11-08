import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from './quotation.contract';
import { effectiveQuotationEdt } from './quotation-edt-adjustments';
import {
  projectPocRolesToQuotationDraft,
  synchronizeQuotationEdtTeamLoad,
  reconcilePocCommercialDraft,
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
  it('proyecta una EDT Gemini real de Drive y conserva HH, documentos y origen al guardarla', () => {
    const originalDraft = original();
    const draft = quotationDraftDataSchema.parse({
      ...originalDraft,
      sourceRefs: ['drive:requerimientos-funcionales'],
      aiPoc: {
        ...originalDraft.aiPoc!,
        source: 'drive',
        proposal: {
          ...originalDraft.aiPoc!.proposal,
          sourceMode: 'drive',
          summary: 'Gemini revisó documentos de Drive',
        },
        edt: {
          schemaVersion: 'kora.quotation.reference-edt.v2',
          source: 'drive',
          provider: 'gemini',
          totalHours: 80,
          reservePercent: 0, reserveHours: 0, totalWithReserve: 80,
          stages: [{
            code: 'T01', name: 'Implementación y pruebas',
            startWeek: 1, durationWeeks: 2, totalHours: 80,
          }],
          modules: [{
            name: 'Módulo documental',
            totalHours: 80,
            tasks: [{
              wbs: 'T01.01', name: 'Integración de Drive', description: 'Leer documentación real',
              role: 'Desarrollo', hours: 80, stageCode: 'T01',
              roleEffort: [
                { role: 'Desarrollo', hours: 40 },
                { role: 'QA', hours: 40 },
              ],
            }],
          }],
        },
      },
    });
    const savedDraft = projectPocRolesToQuotationDraft(draft, { Desarrollo: t1, QA: t2 });
    expect(savedDraft.aiPoc?.source).toBe('drive');
    expect(savedDraft.aiPoc?.proposal.sourceMode).toBe('drive');
    expect(savedDraft.aiPoc?.edt?.source).toBe('drive');
    expect(savedDraft.sourceRefs).toEqual(['drive:requerimientos-funcionales']);
    expect(savedDraft.analysisProjectionStatus).toBe('synced');
    expect(savedDraft.teams).toHaveLength(2);
    expect(savedDraft.phases).toHaveLength(1);
    expect(savedDraft.phases[0]?.teamHours).toEqual([
      { teamId: t1, hours: 40 },
      { teamId: t2, hours: 40 },
    ]);
    expect(() => validatePocDraftIntegrity(draft, savedDraft)).not.toThrow();
    const forged = structuredClone(savedDraft);
    forged.aiPoc!.source = 'kdm_demo';
    expect(() => projectPocRolesToQuotationDraft(forged, { Desarrollo: t1, QA: t2 }))
      .toThrow(/procedencia documental coherente/);
    const inconsistentEdt = structuredClone(savedDraft);
    inconsistentEdt.aiPoc!.edt!.source = 'kdm_demo';
    expect(() => projectPocRolesToQuotationDraft(inconsistentEdt, { Desarrollo: t1, QA: t2 }))
      .toThrow(/procedencia documental coherente/);
  });


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


  it('actualiza hh/sem por persona al cambiar dotación y plazo sin modificar las HH EDT', () => {
    const mapped = projectPocRolesToQuotationDraft(original(), { Desarrollo: t1, QA: t2 });
    const expectedTotal = mapped.phases.flatMap((phase) => phase.teamHours)
      .reduce((sum, item) => sum + item.hours, 0);
    const changed = quotationDraftDataSchema.parse({
      ...mapped,
      teams: mapped.teams.map((team) => team.teamId === t1 ? {
        ...team, collaborators: 4, duration: 2, hoursPerWeek: 90,
        dedicationPercent: 50,
      } : team),
    });
    const normalized = synchronizeQuotationEdtTeamLoad(changed);
    const dev = normalized.teams.find((team) => team.teamId === t1)!;
    expect(dev.hoursPerWeek).toBe(5); // 40 HH / (2 semanas × 4 personas)
    expect(dev.dedicationPercent).toBe(50);
    expect(normalized.phases.flatMap((phase) => phase.teamHours)
      .reduce((sum, item) => sum + item.hours, 0)).toBe(expectedTotal);
    expect(normalized.aiPoc).toEqual(mapped.aiPoc);
    expect(changed.teams.find((team) => team.teamId === t1)?.hoursPerWeek).toBe(90);
    const reconciled = reconcilePocCommercialDraft(changed);
    expect(reconciled.teams.find((team) => team.teamId === t1)?.hoursPerWeek).toBe(5);
    expect(reconciled.teams.find((team) => team.teamId === t1)?.collaborators).toBe(4);
    expect(reconciled.teams.find((team) => team.teamId === t1)?.dedicationPercent).toBe(50);
  });

  it('no altera la fórmula de cotizaciones manuales sin EDT', () => {
    const manual = quotationDraftDataSchema.parse({
      mode: 'team', teams: [{
        teamId: t1, collaborators: 3, unit: 'week', duration: 1,
        hoursPerWeek: 33.33, dedicationPercent: 100,
      }],
    });
    expect(synchronizeQuotationEdtTeamLoad(manual)).toBe(manual);
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

  it('guarda HH humanas por WBS×perfil, recalcula fases y conserva la EDT original', () => {
    const source = original();
    const originalEdt = {
      schemaVersion: 'kora.quotation.reference-edt.v2' as const,
      source: 'kdm_demo' as const, provider: 'gemini' as const,
      totalHours: 80, reservePercent: 10, reserveHours: 8, totalWithReserve: 88,
      stages: [{ code: 'S1', name: 'Implementación', startWeek: 1,
        durationWeeks: 2, totalHours: 80 }],
      modules: [{ name: 'Portal', totalHours: 80, tasks: [{
        wbs: 'S1.01', name: 'Integración', description: 'Backend y pruebas',
        role: 'Desarrollo', hours: 80, stageCode: 'S1',
        roleEffort: [
          { role: 'Desarrollo', hours: 40 }, { role: 'QA', hours: 40 },
        ],
      }] }],
    };
    const draft = quotationDraftDataSchema.parse({
      ...source, aiPoc: { ...source.aiPoc, edt: originalEdt },
      edtHourAdjustments: [{ wbs: 'S1.01', role: 'Desarrollo', hours: 50 }],
    });
    const effective = effectiveQuotationEdt(draft)!;
    expect(effective.totalHours).toBe(90);
    expect(effective.stages?.[0]?.totalHours).toBe(90);
    expect(effective.modules[0]?.tasks[0]?.roleEffort).toEqual([
      { role: 'Desarrollo', hours: 50 }, { role: 'QA', hours: 40 },
    ]);
    expect(effective.reserveHours).toBe(9);
    expect(effective.totalWithReserve).toBe(99);
    expect(draft.aiPoc?.edt).toEqual(originalEdt); // evidencia Gemini inmutable
    const mapped = projectPocRolesToQuotationDraft(draft, {
      Desarrollo: t1, QA: t2,
    });
    expect(mapped.analysisProjectionStatus).toBe('synced');
    expect(mapped.phases[0]?.teamHours).toEqual([
      { teamId: t1, hours: 50 }, { teamId: t2, hours: 40 },
    ]);
    expect(() => validatePocDraftIntegrity(draft, mapped)).not.toThrow();
    const more = projectPocRolesToQuotationDraft({
      ...mapped,
      edtHourAdjustments: [{ wbs: 'S1.01', role: 'Desarrollo', hours: 60 }],
    }, { Desarrollo: t1, QA: t2 });
    expect(() => validatePocDraftIntegrity(mapped, more)).not.toThrow();
    expect(more.phases[0]?.teamHours[0]?.hours).toBe(60);
    expect(more.aiPoc?.edt?.totalHours).toBe(80);
  });

  it('rechaza HH inventadas y ajustes duplicados antes de persistir', () => {
    const source = original();
    const edt = {
      schemaVersion: 'kora.quotation.reference-edt.v1' as const,
      source: 'kdm_demo' as const, provider: 'gemini' as const,
      totalHours: 20,
      modules: [{ name: 'Portal', totalHours: 20, tasks: [{
        wbs: '01.01', name: 'Login', description: 'Auth',
        role: 'Desarrollo', hours: 20,
      }] }],
    };
    const base = quotationDraftDataSchema.parse({
      ...source, aiPoc: { ...source.aiPoc, edt },
    });
    for (const overrides of [
      [{ wbs: '99.99', role: 'Desarrollo', hours: 10 }],
      [{ wbs: '01.01', role: 'QA', hours: 10 }],
      [{ wbs: '01.01', role: 'Desarrollo', hours: 10 },
        { wbs: '01.01', role: 'Desarrollo', hours: 11 }],
      [{ wbs: '01.01', role: 'Desarrollo', hours: 0 }],
      [{ wbs: '01.01', role: 'Desarrollo', hours: 1.234 }],
    ]) {
      expect(() => validatePocDraftIntegrity(base, {
        ...base, edtHourAdjustments: overrides,
      })).toThrow();
    }
  });

  it('impide borrar evidencia IA o reemplazar fuentes en una versión ya guardada', () => {
    const draft = original();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, aiPoc: null })).toThrow();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, sourceRefs: [] })).toThrow();
    expect(() => validatePocDraftIntegrity(draft, { ...draft, answers: {} })).toThrow();
  });
});
