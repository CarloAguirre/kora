import { describe, expect, it } from 'vitest';
import {
  estimationAnalysisArtifactSchema,
  quotationOperationalSnapshotSchema,
  quotationVersionSchema,
} from '@kora/contracts';
import { reconcileQuotationEdt } from './quotation-edt-reconciliation';
import { buildQuotationTransferPreview } from './quotation-transfer-preview';

const IDS = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  version: '0777e456-fd76-445e-83f1-afc25061c102',
  quotation: '0777e456-fd76-445e-83f1-afc25061c103',
  user: '0777e456-fd76-445e-83f1-afc25061c104',
  team: '0777e456-fd76-445e-83f1-afc25061c105',
  module: '0777e456-fd76-445e-83f1-afc25061c106',
  task: '0777e456-fd76-445e-83f1-afc25061c107',
  other: '0777e456-fd76-445e-83f1-afc25061c108',
};

const analysis = estimationAnalysisArtifactSchema.parse({
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Ejemplo', warning: 'Demo',
    sourceFiles: [{ id: 'edt', name: 'EDT.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Portal', client: 'Ejemplo', objective: 'Cargar archivo' },
  scope: { included: ['Portal'], excluded: [], validationStatus: 'ejemplo' },
  sourceRequirements: [], userStories: [], pendingDecisions: [],
  roles: [{ role: 'Fullstack', headcount: 1, baseHours: 8 }],
  modules: [{ name: 'Módulo Portal', activityCount: 1,
    totalHours: 8, hoursByRole: { Fullstack: 8 } }],
  tranches: [{ id: 'T01', name: 'Portal', startWeek: 1, durationWeeks: 1,
    totalHours: 8, hoursByRole: { Fullstack: 8 } }],
  activities: [{ wbs: 'T01.01', trancheId: 'T01', module: 'Módulo Portal',
    description: 'Crear pantalla', requirementIds: [], sourceClassification: 'C',
    responsibleRole: 'Fullstack', hoursByRole: { Fullstack: 8 }, totalHours: 8 }],
  dailyPlan: [], weeklyPlan: [], milestones: [], assumptions: [],
  summary: { baseHours: 8, reservePercent: 10, reserveHours: 0.8,
    hoursWithReserve: 8.8, durationWorkingDays: 1, hoursByRole: { Fullstack: 8 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'mapped_to_kora_teams', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
});

function version() {
  return quotationVersionSchema.parse({
    id: IDS.version, quotationId: IDS.quotation, versionNumber: 1,
    name: 'Simulación', status: 'draft', origin: 'ai', aiReviewStatus: 'pending',
    revision: 1, createdByUserId: IDS.user,
    hourlyRate: null, currency: 'UF', tax: 'iva19',
    totalHours: 8, netAmount: null, totalAmount: null,
    createdAt: '2026-10-30T12:00:00.000Z',
    updatedAt: '2026-10-30T12:00:00.000Z',
    draft: {
      mode: 'phases',
      teams: [{ teamId: IDS.team, collaborators: 1,
        unit: 'week', duration: 1, hoursPerWeek: 40, dedicationPercent: 20 }],
      phases: [{ name: 'Portal', startWeek: 1, durationWeeks: 1,
        teamHours: [{ teamId: IDS.team, hours: 8 }] }],
      costs: [], paymentPlan: [], assumptions: [], exclusions: [],
      sourceRefs: [], answers: {}, analysis, analysisProjectionStatus: 'synced',
    },
  });
}

function project() {
  return quotationOperationalSnapshotSchema.parse({
    projectId: IDS.project, salesStage: 'quoted', status: 'active',
    soldHours: 30, usedHours: 12, startDate: null,
    contractAmount: null, contractCurrency: 'UF',
    teams: [{ teamId: IDS.team, name: 'Desarrollo',
      assignedHours: 30, memberLimit: 1 }],
    moduleCount: 1, taskCount: 1, segmentCount: 0, paymentMilestones: [],
    executionModules: [{
      id: IDS.module, name: 'Modulo Portal', estimatedHours: 10,
      tasks: [{ id: IDS.task, name: 'crear pantalla',
        status: 'done', estimatedHours: 6 }],
    }],
  });
}

describe('reconcileQuotationEdt (sólo lectura)', () => {
  it('encuentra candidatos por nombre, pero no los declara equivalentes ni reemplaza tareas', () => {
    const snapshot = project();
    const preserved = structuredClone(snapshot);
    const result = reconcileQuotationEdt(version(), snapshot);
    expect(result.source).toBe('analysis');
    expect(result.activityCount).toBe(1);
    expect(result.proposedModuleCount).toBe(1);
    expect(result.proposedHours).toBe(8);
    expect(result.modules[0]?.matchStatus).toBe('possible_match');
    expect(result.modules[0]?.deltaVsExisting).toBe(-2);
    expect(result.modules[0]?.activities[0]?.possibleExistingTasks).toEqual([{
      id: IDS.task, name: 'crear pantalla', status: 'done', estimatedHours: 6,
    }]);
    expect(snapshot).toEqual(preserved);
  });

  it('no inventa relación cuando el nombre operativo no coincide', () => {
    const data = project();
    data.executionModules![0]!.name = 'Otro alcance';
    const result = reconcileQuotationEdt(version(), data);
    expect(result.modules[0]?.matchStatus).toBe('no_match');
    expect(result.modules[0]?.deltaVsExisting).toBeNull();
    expect(result.modules[0]?.activities[0]?.possibleExistingTasks).toHaveLength(0);
  });

  it('marca homónimos como ambiguos, sin elegir módulo para transferir', () => {
    const data = project();
    data.executionModules!.push({
      id: IDS.other, name: 'Módulo Portal', estimatedHours: 7, tasks: [],
    });
    const result = reconcileQuotationEdt(version(), data);
    expect(result.modules[0]?.matchStatus).toBe('ambiguous');
    expect(result.modules[0]?.existingCandidates).toHaveLength(2);
    expect(result.modules[0]?.deltaVsExisting).toBeNull();
    const preview = buildQuotationTransferPreview(version(), data, '2026-10-30T18:00:00.000Z');
    expect(preview.transferEnabled).toBe(false);
    expect(preview.findings.some((finding) => finding.code === 'AMBIGUOUS_MODULE_MATCH')).toBe(true);
  });

  it('conserva EDT fuente separada de HH cotizadas si cambió el borrador', () => {
    const v = version();
    v.draft.analysisProjectionStatus = 'modified';
    v.draft.phases[0]!.teamHours[0]!.hours = 10;
    const result = reconcileQuotationEdt(v, project());
    expect(result.source).toBe('modified_analysis');
    expect(result.proposedHours).toBe(8);
    expect(result.notes.join(' ')).toMatch(/no está conciliada/);
  });

  it('no transforma fases comerciales en actividades si no hay documento EDT', () => {
    const v = version();
    v.draft.analysis = null;
    const result = reconcileQuotationEdt(v, project());
    expect(result.source).toBe('no_analysis');
    expect(result.proposedModuleCount).toBe(0);
    expect(result.modules).toHaveLength(0);
  });
});
