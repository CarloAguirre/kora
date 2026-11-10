import { describe, expect, it } from 'vitest';
import { estimationAnalysisArtifactSchema, quotationDraftDataSchema } from '@kora/contracts';
import { QuotationAnalysisIntegrityError, reconcileQuotationAnalysis } from './quotation-analysis-integrity';

const analysis = estimationAnalysisArtifactSchema.parse({
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Ejemplo para pruebas', warning: 'No es IA real',
    sourceFiles: [{ id: 'edt', name: 'ejemplo.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Ejemplo', client: 'Test', objective: 'Validar contratos' },
  scope: { included: [], excluded: [], validationStatus: 'ejemplo' },
  sourceRequirements: [], userStories: [], pendingDecisions: [],
  roles: [{ role: 'Fullstack', headcount: 1, baseHours: 4 }],
  modules: [{ name: 'Portal', activityCount: 1, hoursByRole: { Fullstack: 4 }, totalHours: 4 }],
  tranches: [{ id: 'T01', name: 'Portal', startWeek: 1, durationWeeks: 1,
    totalHours: 4, hoursByRole: { Fullstack: 4 } }],
  activities: [{ wbs: 'T01.01', trancheId: 'T01', module: 'Portal', description: 'API',
    requirementIds: [], sourceClassification: 'D', responsibleRole: 'Fullstack',
    hoursByRole: { Fullstack: 4 }, totalHours: 4 }],
  dailyPlan: [], weeklyPlan: [], milestones: [], assumptions: [],
  summary: { baseHours: 4, reservePercent: 10, reserveHours: 0.4,
    hoursWithReserve: 4.4, durationWorkingDays: 1, hoursByRole: { Fullstack: 4 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'pending', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
});

const saved = quotationDraftDataSchema.parse({
  mode: 'team', teams: [], phases: [], costs: [], paymentPlan: [],
  assumptions: [], exclusions: [], sourceRefs: ['EDT.xlsx'],
  answers: { F01: 'MVP' }, analysis, analysisProjectionStatus: 'synced',
});

describe('reconcileQuotationAnalysis', () => {
  it('mantiene sincronizado el artefacto cuando no cambian campos comerciales', () => {
    const incoming = structuredClone(saved);
    incoming.analysisProjectionStatus = 'modified'; // no confiar en señal del cliente
    const result = reconcileQuotationAnalysis(saved, incoming);
    expect(result.analysisProjectionStatus).toBe('synced');
    expect(result.analysis).toEqual(analysis);
  });

  it('marca diferencias y nunca permite declarar synced después de editar', () => {
    const changed = { ...saved, assumptions: ['Nueva condición'], analysisProjectionStatus: 'synced' as const };
    const result = reconcileQuotationAnalysis(saved, changed);
    expect(result.analysisProjectionStatus).toBe('modified');
    const reverted = reconcileQuotationAnalysis(result, saved);
    expect(reverted.analysisProjectionStatus).toBe('modified');
  });

  it('rechaza reemplazar, quitar o inyectar un análisis por PATCH', () => {
    expect(() => reconcileQuotationAnalysis(saved, { ...saved, analysis: null }))
      .toThrow(QuotationAnalysisIntegrityError);
    const edited = structuredClone(saved);
    if (!edited.analysis) throw new Error('Fixture sin análisis');
    edited.analysis.project.name = 'Otro proyecto';
    expect(() => reconcileQuotationAnalysis(saved, edited)).toThrow(QuotationAnalysisIntegrityError);
    const manual = quotationDraftDataSchema.parse({});
    expect(() => reconcileQuotationAnalysis(manual, saved)).toThrow(QuotationAnalysisIntegrityError);
  });

  it('protege referencias y respuestas de la evidencia original', () => {
    expect(() => reconcileQuotationAnalysis(saved, { ...saved, sourceRefs: [] }))
      .toThrow(QuotationAnalysisIntegrityError);
    expect(() => reconcileQuotationAnalysis(saved, { ...saved, answers: {} }))
      .toThrow(QuotationAnalysisIntegrityError);
  });

  it('no genera marca IA sobre un borrador puramente manual', () => {
    const manual = quotationDraftDataSchema.parse({});
    const changed = { ...manual, assumptions: ['Nuevo supuesto'],
      analysisProjectionStatus: 'synced' as const };
    expect(reconcileQuotationAnalysis(manual, changed).analysisProjectionStatus).toBeUndefined();
  });
});
