import { describe, expect, it } from 'vitest';
import {
  quotationDraftDataSchema,
  quotationEdtAssignments,
  quotationReferenceEdtSchema,
  validatePocDraftIntegrity,
} from '@kora/contracts';
import { buildQuotationTransferReferences } from './quotation-transfer-references';
import { copyQuotationDraft } from './copy-quotation-draft';
import { assertQuotationReadyForClient } from './quotation-commercial-eligibility';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const otherProjectId = '0777e456-fd76-445e-83f1-afc25061c102';
const devId = '0777e456-fd76-445e-83f1-afc25061c103';
const qaId = '0777e456-fd76-445e-83f1-afc25061c104';
const stageOneModuleId = '0777e456-fd76-445e-83f1-afc25061c105';
const stageTwoModuleId = '0777e456-fd76-445e-83f1-afc25061c106';

function aiVersionDraft() {
  const edt = quotationReferenceEdtSchema.parse({
    schemaVersion: 'kora.quotation.reference-edt.v2',
    source: 'drive',
    provider: 'gemini',
    totalHours: 60,
    reservePercent: 0,
    reserveHours: 0,
    totalWithReserve: 60,
    stages: [
      { code: 'STG-01', name: 'Descubrimiento', startWeek: 1, durationWeeks: 2, totalHours: 40 },
      { code: 'TL-GOV', name: 'Gobernanza', startWeek: 1, durationWeeks: 4, totalHours: 20 },
    ],
    modules: [{
      name: 'Desarrollo y gobernanza',
      totalHours: 60,
      tasks: [
        {
          wbs: 'STG-01.01', name: 'API de integración', description: 'API desde Drive',
          role: 'Desarrollo', hours: 40, stageCode: 'STG-01',
          roleEffort: [{ role: 'Desarrollo', hours: 40 }],
        },
        {
          wbs: 'TL-GOV.01', name: 'Control técnico', description: 'Gobernanza',
          role: 'QA', hours: 20, stageCode: 'TL-GOV',
          roleEffort: [{ role: 'QA', hours: 20 }],
        },
      ],
    }],
  });
  return quotationDraftDataSchema.parse({
    mode: 'phases',
    teams: [
      { teamId: devId, collaborators: 1, unit: 'week',
        duration: 4, hoursPerWeek: 10, dedicationPercent: 100 },
      { teamId: qaId, collaborators: 1, unit: 'week',
        duration: 4, hoursPerWeek: 5, dedicationPercent: 100 },
    ],
    phases: [
      { name: 'STG-01 · Descubrimiento', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: devId, hours: 40 }] },
      { name: 'TL-GOV · Gobernanza', startWeek: 1, durationWeeks: 4,
        teamHours: [{ teamId: qaId, hours: 20 }] },
    ],
    paymentPlan: [{ name: 'Entrega', percent: 100, trigger: 'approval' }],
    assumptions: ['Se cuenta con requisitos'],
    exclusions: [],
    sourceRefs: ['drive:requerimientos-documento'],
    answers: { F01: 'sí' },
    aiPoc: {
      source: 'drive',
      proposal: {
        projectId, provider: 'gemini', sourceMode: 'drive',
        documentsAnalyzed: 2, summary: 'Requisitos analizados',
        roles: [
          { role: 'Desarrollo', unit: 'week', duration: 4, hoursPerUnit: 10,
            people: 1, totalHours: 40 },
          { role: 'QA', unit: 'week', duration: 4, hoursPerUnit: 5,
            people: 1, totalHours: 20 },
        ],
        totalHours: 60,
      },
      answers: [],
      dynamicQuestions: [],
      confirmedUnderstanding: 'Se requiere desarrollo y revisión técnica.',
      edt,
      roleTeamIds: { Desarrollo: devId, QA: qaId },
    },
    edtTaskNames: [{ wbs: 'STG-01.01', name: 'API de integración revisada' }],
    edtTaskSettings: [{ wbs: 'STG-01.01', role: 'Desarrollo',
      teamId: devId, fixed: true }],
    analysisProjectionStatus: 'synced',
  });
}

describe('Copia de cotización IA con EDT y traspaso de tareas', () => {
  it('v1 IA → v2 copia conserva WBS, HH, perfiles, evidencia y ediciones', () => {
    const original = aiVersionDraft();
    const saved = structuredClone(original);
    const copied = copyQuotationDraft(original, projectId, projectId);
    expect(original).toEqual(saved);
    expect(copied).not.toBe(original);
    expect(copied.aiPoc?.edt).toEqual(original.aiPoc?.edt);
    expect(copied.aiPoc?.source).toBe('drive');
    expect(copied.sourceRefs).toEqual(original.sourceRefs);
    expect(copied.answers).toEqual(original.answers);
    expect(copied.edtTaskNames).toEqual(original.edtTaskNames);
    expect(copied.edtTaskSettings).toEqual(original.edtTaskSettings);
    expect(copied.analysisProjectionStatus).toBe('synced');

    const assignments = quotationEdtAssignments(copied);
    expect(assignments).toHaveLength(2);
    expect(assignments.map((row) => [row.wbs, row.hours, row.teamId])).toEqual([
      ['STG-01.01', 40, devId],
      ['TL-GOV.01', 20, qaId],
    ]);
    expect(assignments[0]?.name).toBe('API de integración revisada');

    // Se proyectan las 2 tareas a las fases creadas por el traspaso de v2.
    const transferred = buildQuotationTransferReferences(copied, [
      { moduleId: stageOneModuleId, name: copied.phases[0]!.name, totalHours: 40 },
      { moduleId: stageTwoModuleId, name: copied.phases[1]!.name, totalHours: 20 },
    ]);
    expect(transferred.modules.map((phase) => phase.tasks.map((task) => task.wbs)))
      .toEqual([['STG-01.01'], ['TL-GOV.01']]);
    expect(transferred.unassignedTasks).toEqual([]);
  });

  it('v2 → v3 preserva también la EDT sin consultar de nuevo a Gemini', () => {
    const v2 = copyQuotationDraft(aiVersionDraft(), projectId, projectId);
    const v3 = copyQuotationDraft(v2, projectId, projectId);
    expect(v3.aiPoc?.edt?.modules[0]?.tasks).toHaveLength(2);
    expect(v3.edtTaskNames).toEqual(v2.edtTaskNames);
    expect(v3.phases).toEqual(v2.phases);
  });

  it('una copia mantiene la inmutabilidad de la evidencia original', () => {
    const copied = copyQuotationDraft(aiVersionDraft(), projectId, projectId);
    expect(() => validatePocDraftIntegrity(copied, copied)).not.toThrow();
    const tampered = structuredClone(copied);
    tampered.aiPoc!.edt!.modules[0]!.tasks[0]!.name = 'Otra tarea inventada';
    expect(() => validatePocDraftIntegrity(copied, tampered))
      .toThrow(/evidencia original de IA/);
  });

  it('no traslada tareas ni documentos entre proyectos distintos', () => {
    const original = aiVersionDraft();
    const copied = copyQuotationDraft(original, projectId, otherProjectId);
    expect(copied.mode).toBe('phases');
    expect(copied.teams).toEqual(original.teams);
    expect(copied.phases).toEqual(original.phases);
    expect(copied.aiPoc).toBeNull();
    expect(copied.sourceRefs).toEqual([]);
    expect(copied.answers).toEqual({});
    expect(copied.edtTaskNames).toBeUndefined();
    expect(copied.edtTaskSettings).toBeUndefined();
    expect(quotationEdtAssignments(copied)).toEqual([]);
  });

  it('no convierte el fixture KDM en evidencia real al copiarlo', () => {
    const original = aiVersionDraft();
    const demo = quotationDraftDataSchema.parse({
      ...original,
      aiPoc: {
        ...original.aiPoc,
        source: 'kdm_demo',
        proposal: { ...original.aiPoc!.proposal, sourceMode: 'poc_simulated' },
        edt: { ...original.aiPoc!.edt, source: 'kdm_demo' },
      },
    });
    const copied = copyQuotationDraft(demo, projectId, projectId);
    expect(copied.aiPoc).toBeNull();
    expect(copied.sourceRefs).toEqual([]);
    expect(copied.edtTaskSettings).toBeUndefined();
  });

  it('permite aprobar la copia con EDT coherente, pero no con HH sin conciliar', () => {
    const original = aiVersionDraft();
    const copied = copyQuotationDraft(original, projectId, projectId);
    const version = {
      origin: 'copy' as const,
      aiReviewStatus: null,
      draft: copied,
      hourlyRate: 2,
      totalHours: 60,
      netAmount: 120,
      totalAmount: 142.8,
    };
    expect(() => assertQuotationReadyForClient(version)).not.toThrow();
    expect(() => assertQuotationReadyForClient({
      ...version, totalHours: 61,
    })).toThrow(/conciliar/i);
    expect(() => assertQuotationReadyForClient({
      ...version,
      draft: { ...copied, analysisProjectionStatus: 'modified' as const },
    })).toThrow(/Concilia la planificación/);
  });

  it('conserva estado no conciliado para impedir traspaso accidental', () => {
    const original = aiVersionDraft();
    const changed = quotationDraftDataSchema.parse({
      ...original, analysisProjectionStatus: 'modified',
    });
    const copied = copyQuotationDraft(changed, projectId, projectId);
    expect(copied.analysisProjectionStatus).toBe('modified');
  });
});
