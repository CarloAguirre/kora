import { describe, expect, it } from 'vitest';
import {
  quotationOperationalSnapshotSchema,
  quotationTransferPreviewSchema,
  quotationVersionSchema,
} from '@kora/contracts';
import { buildQuotationTransferPreview } from './quotation-transfer-preview';

const TEAM_DEV = '0777e456-fd76-445e-83f1-afc25061c101';
const TEAM_QA = '0777e456-fd76-445e-83f1-afc25061c102';
const projectId = '0777e456-fd76-445e-83f1-afc25061c103';
const quotationId = '0777e456-fd76-445e-83f1-afc25061c104';
const versionId = '0777e456-fd76-445e-83f1-afc25061c105';
const userId = '0777e456-fd76-445e-83f1-afc25061c106';

function project(overrides: Record<string, unknown> = {}) {
  return quotationOperationalSnapshotSchema.parse({
    projectId, salesStage: 'quoted', status: 'active',
    soldHours: 100, usedHours: 60, startDate: '2026-09-01',
    contractAmount: 500, contractCurrency: 'UF',
    teams: [{ teamId: TEAM_DEV, name: 'Desarrollo', assignedHours: 80, memberLimit: 2 }],
    moduleCount: 2, taskCount: 7, segmentCount: 3,
    paymentMilestones: [
      { status: 'paid', amount: 100 }, { status: 'to_invoice', amount: 200 },
    ],
    ...overrides,
  });
}
function version(overrides: Record<string, unknown> = {}) {
  return quotationVersionSchema.parse({
    id: versionId, quotationId, versionNumber: 1, name: 'Cotización inicial',
    status: 'draft', origin: 'manual', aiReviewStatus: null,
    revision: 2, createdByUserId: userId,
    hourlyRate: 2, currency: 'UF', tax: 'iva19', totalHours: 125,
    netAmount: 250, totalAmount: 297.5,
    draft: {
      mode: 'phases',
      teams: [
        { teamId: TEAM_DEV, collaborators: 2, unit: 'week', duration: 2,
          hoursPerWeek: 40, dedicationPercent: 100 },
        { teamId: TEAM_QA, collaborators: 1, unit: 'week', duration: 2,
          hoursPerWeek: 40, dedicationPercent: 50 },
      ],
      phases: [{
        name: 'Implementación', startWeek: 1, durationWeeks: 2,
        teamHours: [{ teamId: TEAM_DEV, hours: 100 }, { teamId: TEAM_QA, hours: 25 }],
      }],
      paymentPlan: [{ name: 'Inicio', percent: 40, trigger: 'approval' },
        { name: 'Cierre', percent: 60, trigger: 'approval' }],
      costs: [], assumptions: [], exclusions: [], sourceRefs: [], answers: {},
    },
    createdAt: '2026-10-30T12:00:00.000Z',
    updatedAt: '2026-10-30T12:00:00.000Z',
    ...overrides,
  });
}
const at = '2026-10-30T18:00:00.000Z';

describe('buildQuotationTransferPreview', () => {
  it('compara HH vendidas y equipos sin tocar el estado del proyecto', () => {
    const before = project();
    const snapshot = structuredClone(before);
    const result = buildQuotationTransferPreview(version(), before, at);
    expect(quotationTransferPreviewSchema.parse(result)).toEqual(result);
    expect(result.transferEnabled).toBe(false);
    expect(result.difference.soldHoursDelta).toBe(25);
    expect(result.difference.remainingComparedToUsed).toBe(65);
    expect(result.teams).toEqual([
      { teamId: TEAM_DEV, name: 'Desarrollo', currentAssignedHours: 80,
        proposedHours: 100, delta: 20, existsInProject: true },
      { teamId: TEAM_QA, name: 'Equipo no asignado al proyecto',
        currentAssignedHours: null, proposedHours: 25, delta: null, existsInProject: false },
    ]);
    expect(before).toEqual(snapshot);
    expect(result.operational.milestoneCounts).toEqual({
      pending: 0, toInvoice: 1, invoiced: 0, paid: 1,
    });
    expect(result.findings.map((f) => f.code)).toContain('HISTORICAL_HOURS');
    expect(result.findings.map((f) => f.code)).toContain('BILLED_MILESTONES');
  });

  it('bloquea de manera explícita versiones borrador, no revisadas e incompletas', () => {
    const v = version({
      origin: 'ai', aiReviewStatus: 'pending', hourlyRate: null,
      netAmount: null, totalAmount: null,
      draft: { ...version().draft, paymentPlan: [
        { name: 'Inicio', percent: 40, trigger: 'approval' },
      ] },
    });
    const result = buildQuotationTransferPreview(v, project(), at);
    expect(result.transferEnabled).toBe(false);
    expect(result.findings.map((f) => f.code)).toEqual(expect.arrayContaining([
      'R3_NOT_IMPLEMENTED', 'VERSION_NOT_APPROVED', 'AI_NOT_REVIEWED',
      'MISSING_RATE', 'PAYMENT_PLAN_INCOMPLETE',
    ]));
  });

  it('no habilita traspaso aunque la versión parezca aprobada y sin horas históricas', () => {
    const result = buildQuotationTransferPreview(version({ status: 'approved' }), project({
      salesStage: 'prospect', status: 'draft', soldHours: 0, usedHours: 0,
      teams: [], moduleCount: 0, taskCount: 0, segmentCount: 0, paymentMilestones: [],
    }), at);
    expect(result.transferEnabled).toBe(false);
    expect(result.findings.some((f) => f.code === 'R3_NOT_IMPLEMENTED')).toBe(true);
  });

  it('no compara montos de distinta moneda', () => {
    const result = buildQuotationTransferPreview(version(), project({ contractCurrency: 'CLP' }), at);
    expect(result.difference.netAmountDelta).toBeNull();
  });

  it('calcula horas solo desde fases cuando la versión usa modo phases', () => {
    const result = buildQuotationTransferPreview(version(), project(), at);
    expect(result.proposed.totalHours).toBe(125);
    expect(result.teams.reduce((sum, t) => sum + t.proposedHours, 0)).toBe(125);
  });
});
