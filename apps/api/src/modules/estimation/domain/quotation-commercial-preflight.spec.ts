import { describe, expect, it } from 'vitest';
import {
  quotationCommercialPreflightSchema,
  estimationAnalysisArtifactSchema,
  quotationOperationalSnapshotSchema,
  quotationVersionSchema,
  type QuotationEligibilityProject,
} from '@kora/contracts';
import { buildQuotationCommercialPreflight } from './quotation-commercial-preflight';

const ids = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  quotation: '0777e456-fd76-445e-83f1-afc25061c102',
  version: '0777e456-fd76-445e-83f1-afc25061c103',
  user: '0777e456-fd76-445e-83f1-afc25061c104',
  team: '0777e456-fd76-445e-83f1-afc25061c105',
};
const at = '2026-11-01T13:30:00.000Z';
const scope: QuotationEligibilityProject = {
  type: 'development', salesStage: 'quoted',
  status: 'draft',
};
const catalog = [{ teamId: ids.team, name: 'Desarrollo', isActive: true }];

function version(draftPatch: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
  return quotationVersionSchema.parse({
    id: ids.version, quotationId: ids.quotation, versionNumber: 2,
    revision: 4, name: 'Versión 2', createdByUserId: ids.user,
    status: 'draft', origin: 'manual', aiReviewStatus: null,
    hourlyRate: 2, currency: 'UF', tax: 'iva19',
    totalHours: 80, netAmount: 160, totalAmount: 190.4,
    createdAt: at, updatedAt: at,
    draft: {
      mode: 'phases',
      teams: [{ teamId: ids.team, collaborators: 1,
        unit: 'week', duration: 2, hoursPerWeek: 40, dedicationPercent: 100 }],
      phases: [{ name: 'Implementación', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: ids.team, hours: 80 }] }],
      paymentPlan: [{ name: 'Inicio', percent: 40, trigger: 'approval' },
        { name: 'Cierre', percent: 60, trigger: 'phase', triggerPhase: 'Implementación' }],
      costs: [], assumptions: [], exclusions: [], sourceRefs: [], answers: {},
      ...draftPatch,
    },
    ...patch,
  });
}
function operational(patch: Record<string, unknown> = {}) {
  return quotationOperationalSnapshotSchema.parse({
    projectId: ids.project, salesStage: 'quoted', status: 'draft',
    soldHours: 0, usedHours: 0, startDate: null,
    contractAmount: null, contractCurrency: 'UF',
    teams: [], moduleCount: 0, taskCount: 0, segmentCount: 0,
    paymentMilestones: [],
    ...patch,
  });
}
function run(v = version(), c = catalog, o = operational(), p = scope) {
  return buildQuotationCommercialPreflight(v, p, o, c, at);
}
const codes = (result: ReturnType<typeof run>) =>
  result.findings.map((item) => item.code);

describe('R3-f · validación comercial de solo lectura', () => {
  it('diagnostica contenido completo pero jamás habilita enviar una cotización', () => {
    const v = version();
    const saved = structuredClone(v);
    const result = run(v);
    expect(quotationCommercialPreflightSchema.parse(result)).toEqual(result);
    expect(result.blockerCount).toBe(0);
    expect(result.contentChecksPassed).toBe(true);
    expect(result.sendEnabled).toBe(false);
    expect(result.summary).toMatchObject({
      totalHours: 80, paymentPercent: 100, netAmount: 160, totalAmount: 190.4,
    });
    expect(codes(result)).toContain('TAX_POLICY_PENDING');
    expect(v).toEqual(saved);
  });

  it('detecta equipos que dejaron de existir o están inactivos', () => {
    const result = run(version(), [{ ...catalog[0]!, isActive: false }]);
    expect(codes(result)).toContain('TEAM_UNAVAILABLE');
    expect(result.contentChecksPassed).toBe(false);
    expect(codes(run(version(), []))).toContain('TEAM_UNAVAILABLE');
  });

  it('bloquea fases sin HH y un plan de pagos menor al 100%', () => {
    const v = version({
      phases: [{ name: 'Implementación', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: ids.team, hours: 0 }] }],
      paymentPlan: [{ name: 'Inicio', percent: 99.99, trigger: 'approval' }],
    });
    const result = run(v);
    expect(codes(result)).toEqual(expect.arrayContaining([
      'PHASE_WITHOUT_HOURS', 'ZERO_HOURS', 'STORED_HOURS_MISMATCH', 'PAYMENT_PLAN_NOT_100',
    ]));
  });

  it('valida relación de hitos con fases y fechas del plan comercial', () => {
    const v = version({
      paymentPlan: [
        { name: 'Firma', percent: 50, trigger: 'phase', triggerPhase: 'Fase inexistente' },
        { name: 'Cierre', percent: 50, trigger: 'date' },
      ],
    });
    expect(codes(run(v))).toEqual(expect.arrayContaining([
      'PAYMENT_PHASE_INVALID', 'PAYMENT_DATE_MISSING',
    ]));
  });

  it('detecta importes no calculados o desfasados y tarifa ausente', () => {
    const withoutRate = version({}, {
      hourlyRate: null, netAmount: null, totalAmount: null,
    });
    expect(codes(run(withoutRate))).toContain('RATE_REQUIRED');
    const stale = version({}, { totalHours: 60, netAmount: 120, totalAmount: 142.8 });
    expect(codes(run(stale))).toEqual(expect.arrayContaining([
      'STORED_HOURS_MISMATCH', 'STORED_AMOUNT_MISMATCH',
    ]));
  });

  it('advierte que los costos mensuales/anuales no están incluidos en el total', () => {
    const result = run(version({
      costs: [{ description: 'Hosting', amount: 10, recurrence: 'monthly' },
        { description: 'Licencia', amount: 20, recurrence: 'annual' }],
    }));
    expect(codes(result)).toContain('RECURRING_COSTS_EXCLUDED');
    expect(result.summary.totalAmount).toBe(190.4);
    expect(result.sendEnabled).toBe(false);
  });

  it('distingue modo por equipos: no suma HH de fases que quedan fuera del cálculo', () => {
    const v = version({
      mode: 'team',
      phases: [{ name: 'No vigente', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: ids.team, hours: 900 }] }],
    });
    const result = run(v);
    expect(result.summary.totalHours).toBe(80);
    expect(codes(result)).toContain('UNUSED_PHASES');
  });

  it('bloquea propuestas de IA pendientes y análisis modificado', () => {
    const v = version({ analysisProjectionStatus: 'modified' }, {
      origin: 'ai', aiReviewStatus: 'pending',
    });
    const result = run(v);
    expect(codes(result)).toEqual(expect.arrayContaining([
      'AI_EVIDENCE_MISSING', 'AI_REVIEW_REQUIRED', 'ANALYSIS_NOT_RECONCILED',
    ]));
    expect(result.sendEnabled).toBe(false);
  });


  it('bloquea explícitamente el artefacto demostrativo incluso si otra validación luce completa', () => {
    const simulated = estimationAnalysisArtifactSchema.parse({
      schemaVersion: 'kora.estimation.analysis.v1',
      provenance: { mode: 'simulated_fixture', provider: null, model: null,
        label: 'Demo Zurich', warning: 'Sin IA productiva',
        sourceFiles: [{ id: 'edt', name: 'EDT.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }] },
      project: { name: 'Proyecto', client: 'Cliente', objective: 'Ejemplo' },
      scope: { included: ['Alcance'], excluded: [], validationStatus: 'ejemplo' },
      sourceRequirements: [], userStories: [], pendingDecisions: [],
      roles: [{ role: 'Fullstack', headcount: 1, baseHours: 8 }],
      modules: [{ name: 'Portal', activityCount: 1, totalHours: 8,
        hoursByRole: { Fullstack: 8 } }],
      tranches: [{ id: 'T01', name: 'Portal', startWeek: 1, durationWeeks: 1,
        totalHours: 8, hoursByRole: { Fullstack: 8 } }],
      activities: [{ wbs: 'T01.01', trancheId: 'T01', module: 'Portal',
        description: 'Crear endpoint', requirementIds: [], sourceClassification: 'C',
        responsibleRole: 'Fullstack', hoursByRole: { Fullstack: 8 }, totalHours: 8 }],
      dailyPlan: [], weeklyPlan: [], milestones: [], assumptions: [],
      summary: { baseHours: 8, reservePercent: 10, reserveHours: 0.8,
        hoursWithReserve: 8.8, durationWorkingDays: 1, hoursByRole: { Fullstack: 8 } },
      commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
      roleTeamMappings: { status: 'mapped_to_kora_teams', suggestions: {} },
      renderBlueprints: { ers: [], edt: [] },
    });
    const v = version({ analysis: simulated }, {
      origin: 'ai', aiReviewStatus: 'accepted',
    });
    const result = run(v);
    expect(codes(result)).toContain('SIMULATED_ANALYSIS');
    expect(result.contentChecksPassed).toBe(false);
    expect(result.sendEnabled).toBe(false);
  });

  it('advierte proyecto operativo activo/histórico sin convertirlo en sustitución contractual', () => {
    const result = run(version(), catalog, operational({
      status: 'active', usedHours: 25,
      paymentMilestones: [{ status: 'paid', amount: 100 }],
    }), { ...scope, status: 'active' });
    expect(codes(result)).toContain('HISTORICAL_EXECUTION');
    expect(result.contentChecksPassed).toBe(true);
    expect(result.sendEnabled).toBe(false);
  });

  it('no declara apta para envío una versión ya enviada o un proyecto cerrado', () => {
    const result = run(version({}, { status: 'sent' }), catalog,
      operational({ status: 'finished' }), { ...scope, status: 'finished' });
    expect(codes(result)).toEqual(expect.arrayContaining([
      'VERSION_NOT_DRAFT', 'PROJECT_INELIGIBLE',
    ]));
    expect(result.sendEnabled).toBe(false);
  });
});
