import { describe, expect, it } from 'vitest';
import { quotationTransferPreviewSchema } from '@kora/contracts';
import { buildReconciliationReview, emptyReconciliationChoices,
  type ReconciliationChoices } from './quotation-reconciliation-review';

const IDS = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  version: '0777e456-fd76-445e-83f1-afc25061c102',
  module: '0777e456-fd76-445e-83f1-afc25061c103',
  task: '0777e456-fd76-445e-83f1-afc25061c104',
  wrongModule: '0777e456-fd76-445e-83f1-afc25061c105',
  wrongTask: '0777e456-fd76-445e-83f1-afc25061c106',
};
const preview = quotationTransferPreviewSchema.parse({
  projectId: IDS.project, versionId: IDS.version, versionNumber: 2,
  revision: 4, calculatedAt: '2026-10-30T18:00:00.000Z',
  transferEnabled: false,
  proposed: {
    status: 'draft', origin: 'manual', aiReviewStatus: null,
    currency: 'UF', totalHours: 12, netAmount: null, totalAmount: null,
    hourlyRateDefined: false, paymentPercent: 0,
  },
  operational: {
    status: 'active', salesStage: 'quoted', soldHours: 10, usedHours: 5,
    startDate: null, contractAmount: null, contractCurrency: 'UF',
    moduleCount: 1, taskCount: 1, segmentCount: 0,
    milestoneCounts: { pending: 0, toInvoice: 0, invoiced: 0, paid: 1 },
  },
  difference: { soldHoursDelta: 2, remainingComparedToUsed: 7, netAmountDelta: null },
  teams: [],
  edtReconciliation: {
    source: 'analysis', proposedModuleCount: 1, activityCount: 1,
    proposedHours: 12,
    availableExistingModules: [{
      id: IDS.module, name: 'Módulo Portal', estimatedHours: 10,
      tasks: [{ id: IDS.task, name: 'Registrar documento', status: 'done', estimatedHours: 10 }],
    }],
    modules: [{
      name: 'Portal', proposedHours: 12, matchStatus: 'no_match',
      deltaVsExisting: null, existingCandidates: [],
      activities: [{
        wbs: 'T01.01', description: 'Registrar documento',
        proposedHours: 12, role: 'Fullstack',
        possibleExistingTasks: [],
      }],
    }],
    notes: [],
  },
  findings: [{ code: 'R3_NOT_IMPLEMENTED', severity: 'blocker', message: 'Bloqueado' }],
  pendingDecisionIds: ['D04', 'D05', 'D06'],
});
const when = '2026-10-30T18:10:00.000Z';

describe('buildReconciliationReview — acta D04 no ejecutable', () => {
  it('genera borrador vinculado a versión, revisión y snapshot sin permitir traspaso', () => {
    const original = structuredClone(preview);
    const doc = buildReconciliationReview(preview, emptyReconciliationChoices(), when);
    expect(doc.status).toBe('draft_for_discussion');
    expect(doc.transferEnabled).toBe(false);
    expect(doc.versionRevision).toBe(4);
    expect(doc.previewCalculatedAt).toBe(preview.calculatedAt);
    expect(doc.moduleDecisions[0]?.decision).toBe('pending');
    expect(doc.moduleDecisions[0]?.activityDecisions[0]?.decision).toBe('pending');
    expect(doc.issues).toEqual(expect.arrayContaining([
      'HORAS_HISTORICAS: proteger las HH consumidas; revisar D05.',
      'HITOS_FACTURADOS: no sustituir facturas/hitos existentes; revisar D05.',
    ]));
    expect(preview).toEqual(original);
  });

  it('permite asociar explícitamente un módulo y una tarea existentes usando sus IDs', () => {
    const choices: ReconciliationChoices = {
      modules: { 0: { decision: 'link_existing', targetId: IDS.module, note: 'Revisado por el equipo' } },
      activities: { 'T01.01': { decision: 'link_existing', targetId: IDS.task, note: 'No duplicar tarea cerrada' } },
    };
    const doc = buildReconciliationReview(preview, choices, when);
    expect(doc.moduleDecisions[0]?.targetModuleId).toBe(IDS.module);
    expect(doc.moduleDecisions[0]?.activityDecisions[0]?.targetTaskId).toBe(IDS.task);
    expect(doc.moduleDecisions[0]?.note).toBe('Revisado por el equipo');
    expect(doc.transferEnabled).toBe(false);
    expect(doc.issues.some((value) => value.startsWith('MODULO_PENDIENTE'))).toBe(false);
  });

  it('rechaza módulos o tareas que no figuran en el snapshot de este proyecto', () => {
    const wrongModule: ReconciliationChoices = {
      modules: { 0: { decision: 'link_existing', targetId: IDS.wrongModule, note: '' } },
      activities: {},
    };
    expect(() => buildReconciliationReview(preview, wrongModule, when)).toThrow(/módulo existente/);
    const wrongTask: ReconciliationChoices = {
      modules: { 0: { decision: 'link_existing', targetId: IDS.module, note: '' } },
      activities: { 'T01.01': { decision: 'link_existing', targetId: IDS.wrongTask, note: '' } },
    };
    expect(() => buildReconciliationReview(preview, wrongTask, when)).toThrow(/tarea del módulo/);
  });

  it('no enlaza tareas existentes dentro de módulos propuestos como nuevos', () => {
    const invalid: ReconciliationChoices = {
      modules: { 0: { decision: 'propose_new', targetId: null, note: '' } },
      activities: { 'T01.01': { decision: 'link_existing', targetId: IDS.task, note: '' } },
    };
    expect(() => buildReconciliationReview(preview, invalid, when)).toThrow(/tarea del módulo/);
  });

  it('detecta EDT editada y nunca interpreta una revisión como aprobación', () => {
    const changed = { ...preview, proposed: { ...preview.proposed, totalHours: 15 },
      edtReconciliation: { ...preview.edtReconciliation, source: 'modified_analysis' as const } };
    const result = buildReconciliationReview(changed, emptyReconciliationChoices(), when);
    expect(result.issues).toEqual(expect.arrayContaining([
      'EDT_DESACTUALIZADA: las HH comerciales no coinciden necesariamente con las originales.',
      'HH_DIVERGENTES: HH comerciales distintas de la EDT original.',
    ]));
    expect(result.status).toBe('draft_for_discussion');
  });

  it('no inventa filas WBS cuando falta el análisis fuente', () => {
    const missing = { ...preview,
      edtReconciliation: {
        source: 'no_analysis' as const, activityCount: 0,
        proposedModuleCount: 0, proposedHours: 0,
        modules: [], notes: [], availableExistingModules: [],
      },
    };
    const doc = buildReconciliationReview(missing, emptyReconciliationChoices(), when);
    expect(doc.moduleDecisions).toHaveLength(0);
    expect(doc.issues).toContain('NO_EDT: la versión no contiene actividades WBS para conciliar.');
    expect(doc.transferEnabled).toBe(false);
  });
});
