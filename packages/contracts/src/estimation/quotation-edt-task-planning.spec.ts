import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from './quotation.contract';
import { effectiveQuotationEdt } from './quotation-edt-adjustments';
import {
  quotationEdtAssignments, redistributeQuotationEdtHours,
  withQuotationTaskSetting, withQuotationEdtStageSetting,
  withQuotationCommercialStage, withQuotationCommercialTask,
  patchQuotationCommercialTask, withoutQuotationCommercialTask,
  withQuotationTaskDisplayName,
} from './quotation-edt-task-planning';
import {
  projectPocRolesToQuotationDraft, reconcilePocCommercialDraft,
  validatePocDraftIntegrity,
} from './quotation-poc-projection';

const dev = '0777e456-fd76-445e-83f1-afc25061c101';
const qa = '0777e456-fd76-445e-83f1-afc25061c102';
const ux = '0777e456-fd76-445e-83f1-afc25061c103';
const emptyTeam = (teamId: string) => ({
  teamId, collaborators: 1, unit: 'week' as const,
  duration: 2, hoursPerWeek: 40, dedicationPercent: 100,
});
const source = () => quotationDraftDataSchema.parse({
  mode: 'team',
  teams: [],
  aiPoc: {
    source: 'kdm_demo',
    answers: [], dynamicQuestions: [],
    roleTeamIds: {},
    proposal: {
      projectId: '0777e456-fd76-445e-83f1-afc25061c100',
      provider: 'gemini', sourceMode: 'poc_simulated',
      documentsAnalyzed: 1, summary: 'Portal con integración y QA',
      roles: [
        { role: 'Desarrollo', unit: 'week', duration: 1,
          hoursPerUnit: 40, people: 1, totalHours: 40 },
        { role: 'QA', unit: 'week', duration: 1,
          hoursPerUnit: 20, people: 1, totalHours: 20 },
      ],
      totalHours: 60, assumptions: [], clarifyingQuestions: [],
    },
    edt: {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 60, reservePercent: 10, reserveHours: 6, totalWithReserve: 66,
      stages: [
        { code: 'T01', name: 'Implementación', startWeek: 1,
          durationWeeks: 2, totalHours: 40 },
        { code: 'T02', name: 'Pruebas', startWeek: 3,
          durationWeeks: 1, totalHours: 20 },
      ],
      modules: [
        { name: 'Portal', totalHours: 40, tasks: [
          { wbs: 'T01.01', name: 'API', description: 'REST',
            role: 'Desarrollo', hours: 20, stageCode: 'T01',
            roleEffort: [{ role: 'Desarrollo', hours: 10 },
              { role: 'QA', hours: 10 }] },
          { wbs: 'T01.02', name: 'Frontend', description: 'UI',
            role: 'Desarrollo', hours: 20, stageCode: 'T01',
            roleEffort: [{ role: 'Desarrollo', hours: 20 }] },
        ] },
        { name: 'Cierre', totalHours: 20, tasks: [
          { wbs: 'T02.01', name: 'Regresión', description: 'UAT',
            role: 'QA', hours: 10, stageCode: 'T02',
            roleEffort: [{ role: 'QA', hours: 10 }] },
          { wbs: 'T02.02', name: 'Ajustes', description: 'Parches',
            role: 'Desarrollo', hours: 10, stageCode: 'T02',
            roleEffort: [{ role: 'Desarrollo', hours: 10 }] },
        ] },
      ],
    },
  },
});

describe('EDT comercial: equipos, tareas Fija y redistribución por centésimos', () => {

  it('en un mismo WBS, renombrar un perfil no modifica el otro ni las HH', () => {
    const sourceDraft = source();
    const withRoles = quotationDraftDataSchema.parse({
      ...sourceDraft,
      aiPoc: {
        ...sourceDraft.aiPoc!,
        edt: {
          ...sourceDraft.aiPoc!.edt!,
          modules: sourceDraft.aiPoc!.edt!.modules.map((m) => ({
            ...m,
            tasks: m.tasks.map((task) => task.wbs === 'T01.01' ? {
              ...task, roleEffort: [
                { role: 'Desarrollo', hours: 10,
                  taskName: 'Construir API', taskDescription: 'Implementar endpoint REST.' },
                { role: 'QA', hours: 10,
                  taskName: 'Probar API', taskDescription: 'Verificar endpoint REST.' },
              ],
            } : task),
          })),
        },
      },
    });
    const edited = withQuotationTaskDisplayName(withRoles,
      'T01.01', 'Implementar API revisada', 'Desarrollo');
    const rows = quotationEdtAssignments(edited).filter((row) => row.wbs === 'T01.01');
    expect(rows.map((row) => [row.role, row.name, row.description, row.hours]))
      .toEqual([
        ['Desarrollo', 'Implementar API revisada', 'Implementar endpoint REST.', 10],
        ['QA', 'Probar API', 'Verificar endpoint REST.', 10],
      ]);
    expect(edited.aiPoc?.edt).toEqual(withRoles.aiPoc?.edt);
    expect(() => withQuotationTaskDisplayName(withRoles,
      'T01.01', 'Tarea imposible', 'Arquitectura')).toThrow(/WBS\/perfil/);
  });

  it('redistribuye la diferencia exacta entre tareas no fijas, preservando Fija y otros tramos', () => {
    const draft = withQuotationTaskSetting(source(), 'T01.01', 'Desarrollo', { fixed: true });
    const updated = redistributeQuotationEdtHours(draft, {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 25,
    });
    const rows = quotationEdtAssignments(updated);
    expect(rows.find((r) => r.wbs === 'T01.01' && r.role === 'Desarrollo')?.hours).toBe(10);
    expect(rows.find((r) => r.wbs === 'T01.02' && r.role === 'Desarrollo')?.hours).toBe(15);
    expect(rows.find((r) => r.wbs === 'T02.02' && r.role === 'Desarrollo')?.hours).toBe(10);
    expect(effectiveQuotationEdt(updated)?.totalHours).toBe(55);
    expect(source().aiPoc?.edt?.totalHours).toBe(60);
  });

  it('al reducir 1 HH entre dos tareas flexibles, descuenta 0,5 HH a cada una', () => {
    const revised = redistributeQuotationEdtHours(source(), {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 29,
    });
    const rows = quotationEdtAssignments(revised).filter((row) =>
      row.stageCode === 'T01' && row.role === 'Desarrollo');
    expect(rows.map((row) => row.hours)).toEqual([9.5, 19.5]);
    expect(effectiveQuotationEdt(revised)?.totalHours).toBe(59);
  });

  it('descuenta dos centésimos de dos tareas, uno de cada una', () => {
    const revised = redistributeQuotationEdtHours(source(), {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 29.98,
    });
    const rows = quotationEdtAssignments(revised).filter((row) =>
      row.stageCode === 'T01' && row.role === 'Desarrollo');
    expect(rows.map((row) => row.hours)).toEqual([9.99, 19.99]);
  });

  it('resta en partes iguales, asigna el centésimo sobrante en orden estable', () => {
    const revised = redistributeQuotationEdtHours(source(), {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 21.01,
    });
    const rows = quotationEdtAssignments(revised).filter((r) =>
      r.stageCode === 'T01' && r.role === 'Desarrollo');
    expect(rows.map((row) => row.hours)).toEqual([5.5, 15.51]);
    expect(rows.reduce((sum, row) => sum + Math.round(row.hours * 100), 0))
      .toBe(2101);
  });

  it('no cambia ninguna tarea cuando todas son fijas; rechaza un total imposible', () => {
    let draft = source();
    draft = withQuotationTaskSetting(draft, 'T01.01', 'Desarrollo', { fixed: true });
    draft = withQuotationTaskSetting(draft, 'T01.02', 'Desarrollo', { fixed: true });
    expect(() => redistributeQuotationEdtHours(draft, {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 5,
    })).toThrow(/No hay tareas editables/);
    const partiallyFixed = withQuotationTaskSetting(source(),
      'T01.01', 'Desarrollo', { fixed: true });
    expect(() => redistributeQuotationEdtHours(partiallyFixed, {
      teamKey: 'profile:Desarrollo', stageCode: 'T01', targetHours: 10,
    })).toThrow(/menores que las tareas fijas/);
    expect(effectiveQuotationEdt(draft)?.totalHours).toBe(60);
  });

  it('conserva HH al cambiar de equipo y recalcula todos los subtotales tras el mapeo', () => {
    const mapped = projectPocRolesToQuotationDraft(source(), {
      Desarrollo: dev, QA: qa,
    });
    const withExtra = { ...mapped, teams: [...mapped.teams, emptyTeam(ux)] };
    const moved = withQuotationTaskSetting(withExtra, 'T01.01', 'Desarrollo', {
      teamId: ux, fixed: true,
    });
    const reconciled = reconcilePocCommercialDraft(moved);
    const first = reconciled.phases[0]!;
    expect(first.teamHours.find((r) => r.teamId === ux)?.hours).toBe(10);
    expect(first.teamHours.find((r) => r.teamId === dev)?.hours).toBe(20);
    expect(first.teamHours.find((r) => r.teamId === qa)?.hours).toBe(10);
    expect(reconciled.phases.reduce((sum, phase) => sum +
      phase.teamHours.reduce((s, row) => s + row.hours, 0), 0)).toBe(60);
    expect(() => validatePocDraftIntegrity(mapped, reconciled)).not.toThrow();
    expect(source().aiPoc?.edt?.totalHours).toBe(60);
  });

  it('permite editar semanas y nombre comercial sin alterar el tramo original', () => {
    const first = withQuotationEdtStageSetting(source(), 'T01', {
      name: 'Integración ERP', startWeek: 4, durationWeeks: 3,
    });
    const mapped = projectPocRolesToQuotationDraft(first, { Desarrollo: dev, QA: qa });
    expect(mapped.phases[0]).toMatchObject({
      name: 'T01 · Integración ERP', startWeek: 4, durationWeeks: 3,
    });
    expect(first.aiPoc?.edt?.stages?.[0]).toMatchObject({
      name: 'Implementación', startWeek: 1, durationWeeks: 2,
    });
    expect(() => withQuotationEdtStageSetting(first, 'T01',
      { startWeek: 520, durationWeeks: 2 })).toThrow(/semanas/);
  });

  it('rechaza WBS inventado, equipos ajenos, roles duplicados y precisión inválida', () => {
    const baseline = source();
    expect(() => withQuotationTaskSetting(baseline,
      'NO-EXISTE', 'QA', { fixed: true })).toThrow(/No existe/);
    expect(() => withQuotationTaskSetting(baseline,
      'T01.01', 'QA', { teamId: ux })).toThrow(/no pertenece/);
    expect(() => quotationEdtAssignments({
      ...baseline, edtTaskSettings: [
        { wbs: 'T01.01', role: 'QA', fixed: true },
        { wbs: 'T01.01', role: 'QA', fixed: true },
      ],
    })).toThrow(/duplicado/);
    expect(() => redistributeQuotationEdtHours(baseline, {
      teamKey: 'profile:Desarrollo', targetHours: 10.123,
    })).toThrow(/máximo dos decimales/);
  });

  it('reparte globalmente en modo Por equipo afectando todas las fases, no otros perfiles', () => {
    const revised = redistributeQuotationEdtHours(source(), {
      teamKey: 'profile:Desarrollo', targetHours: 34,
    });
    const entries = quotationEdtAssignments(revised);
    expect(entries.filter((row) => row.role === 'Desarrollo')
      .reduce((sum, row) => sum + Math.round(row.hours * 100), 0)).toBe(3400);
    expect(entries.filter((row) => row.role === 'QA')
      .reduce((sum, row) => sum + Math.round(row.hours * 100), 0)).toBe(2000);
  });
  it('agrega fases y tareas propias con HH comerciales sin reescribir Gemini', () => {
    const mapped = projectPocRolesToQuotationDraft(source(), { Desarrollo: dev, QA: qa });
    const unchangedEvidence = structuredClone(mapped.aiPoc?.edt);
    const addedStage = {
      code: 'KS-0777e456-fd76-445e-83f1-afc25061c104',
      name: 'Entrega', startWeek: 4, durationWeeks: 2,
    };
    const task = {
      wbs: 'KT-0777e456-fd76-445e-83f1-afc25061c105',
      stageCode: addedStage.code, name: 'Informe ejecutivo',
      teamId: qa, hours: 12, fixed: false,
    };
    const withStage = withQuotationCommercialStage(mapped, addedStage);
    const withTask = withQuotationCommercialTask(withStage, task);
    const next = reconcilePocCommercialDraft(withTask);
    expect(next.phases).toHaveLength(3);
    expect(next.phases[2]?.name).toContain('Entrega');
    expect(next.phases[2]?.teamHours).toEqual([{ teamId: qa, hours: 12 }]);
    expect(next.phases.reduce((sum, phase) =>
      sum + phase.teamHours.reduce((h, row) => h + row.hours, 0), 0)).toBe(72);
    expect(next.aiPoc?.edt).toEqual(unchangedEvidence);
    expect(() => validatePocDraftIntegrity(mapped, next)).not.toThrow();

    const renamed = withQuotationTaskDisplayName(next, 'T01.01', 'API revisada');
    expect(quotationEdtAssignments(renamed).find((row) =>
      row.wbs === 'T01.01')?.name).toBe('API revisada');
    expect(renamed.aiPoc?.edt).toEqual(unchangedEvidence);
    expect(() => validatePocDraftIntegrity(next, reconcilePocCommercialDraft(renamed)))
      .not.toThrow();
  });

  it('edita y elimina solamente una tarea añadida, protege fijas y evita HH inventadas', () => {
    const mapped = projectPocRolesToQuotationDraft(source(), { Desarrollo: dev, QA: qa });
    const task = {
      wbs: 'KT-0777e456-fd76-445e-83f1-afc25061c105', stageCode: 'T01',
      name: 'Validación extra', teamId: dev, hours: 8, fixed: false,
    };
    const added = withQuotationCommercialTask(mapped, task);
    const adjusted = patchQuotationCommercialTask(added, task.wbs, { hours: 9.5 });
    expect(reconcilePocCommercialDraft(adjusted).phases[0]?.teamHours
      .find((row) => row.teamId === dev)?.hours).toBe(39.5);
    const fixed = withQuotationTaskSetting(adjusted, task.wbs, 'Tarea comercial',
      { fixed: true });
    const redistributed = redistributeQuotationEdtHours(fixed, {
      teamKey: dev, stageCode: 'T01', targetHours: 40,
    });
    expect(quotationEdtAssignments(redistributed).find((row) =>
      row.wbs === task.wbs)?.hours).toBe(9.5);
    expect(quotationEdtAssignments(redistributed).filter((row) =>
      row.teamId === dev && row.stageCode === 'T01')
      .reduce((sum, row) => sum + row.hours, 0)).toBe(40);
    const removed = withoutQuotationCommercialTask(adjusted, task.wbs);
    expect(reconcilePocCommercialDraft(removed).phases.reduce((sum, phase) =>
      sum + phase.teamHours.reduce((h, row) => h + row.hours, 0), 0)).toBe(60);
    expect(() => withoutQuotationCommercialTask(adjusted, 'T01.01'))
      .toThrow(/original/);
  });

});
