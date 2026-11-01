import { describe, expect, it } from 'vitest';
import {
  quotationCommercialDossierSchema,
  quotationOperationalSnapshotSchema,
  quotationVersionSchema,
} from '@kora/contracts';
import { buildQuotationCommercialPreflight } from './quotation-commercial-preflight';
import { buildQuotationCommercialDossier } from './quotation-commercial-dossier';

const ids = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  quotation: '0777e456-fd76-445e-83f1-afc25061c102',
  version: '0777e456-fd76-445e-83f1-afc25061c103',
  user: '0777e456-fd76-445e-83f1-afc25061c104',
  team: '0777e456-fd76-445e-83f1-afc25061c105',
};
const at = '2026-11-01T14:00:00.000Z';
const scope = { type: 'development' as const, status: 'draft' as const, salesStage: 'quoted' as const };
const catalog = [{ teamId: ids.team, name: 'Desarrollo', isActive: true }];
const makeVersion = (patch: Record<string, unknown> = {}) => quotationVersionSchema.parse({
  id: ids.version, quotationId: ids.quotation, versionNumber: 2, revision: 3,
  name: 'Portal', status: 'draft', origin: 'manual', aiReviewStatus: null,
  createdByUserId: ids.user, hourlyRate: 3, currency: 'UF', tax: 'iva19',
  totalHours: 80, netAmount: 240, totalAmount: 285.6,
  createdAt: at, updatedAt: at,
  draft: {
    mode: 'phases',
    teams: [{ teamId: ids.team, collaborators: 1, duration: 2,
      unit: 'week', hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [{ name: 'Portal', startWeek: 1, durationWeeks: 2,
      teamHours: [{ teamId: ids.team, hours: 80 }] }],
    costs: [], paymentPlan: [{ name: 'Cierre', percent: 100, trigger: 'approval' }],
    assumptions: ['Cliente aporta ambientes'], exclusions: ['No incluye SAP'],
    sourceRefs: ['https://example.org/documento-privado'], answers: { secret: 'No incluir' },
  },
  ...patch,
});
const operational = quotationOperationalSnapshotSchema.parse({
  projectId: ids.project, salesStage: 'quoted', status: 'draft',
  soldHours: 0, usedHours: 0, startDate: null,
  contractAmount: null, contractCurrency: 'UF',
  teams: [], moduleCount: 0, taskCount: 0, segmentCount: 0, paymentMilestones: [],
});
const report = (v = makeVersion(), c = catalog) => {
  const check = buildQuotationCommercialPreflight(v, scope, operational, c, at);
  return buildQuotationCommercialDossier(v, check, c, at);
};

describe('R3-g expediente interno de cotización', () => {
  it('preserva versión, HH, costos, pagos y decisiones sin autorizar envío', () => {
    const v = makeVersion();
    const before = structuredClone(v);
    const dossier = report(v);
    expect(quotationCommercialDossierSchema.parse(dossier)).toEqual(dossier);
    expect(dossier).toMatchObject({
      schemaVersion: 'kora.quotation.commercial-dossier.v1',
      documentStatus: 'internal_review_only',
      deliveryEnabled: false, commercialApprovalEnabled: false, transferEnabled: false,
      projectId: ids.project, versionId: ids.version, versionNumber: 2, revision: 3,
      quotation: {
        mode: 'phases', totalHours: 80, netAmount: 240, totalAmount: 285.6,
        teams: [{ name: 'Desarrollo', isActive: true,
          quotedHours: 80, capacityReferenceHours: 80 }],
      },
    });
    expect(dossier.validation.contentChecksPassed).toBe(true);
    expect(dossier.validation.sendEnabled).toBe(false);
    expect(dossier.outstandingBusinessGates.map((gate) => gate.id)).toEqual(['D02', 'D05', 'D06']);
    expect(dossier.outstandingBusinessGates.every((gate) => gate.status === 'pending')).toBe(true);
    expect(dossier.quotation.sourcesCount).toBe(1);
    expect(JSON.stringify(dossier)).not.toContain('https://example.org/documento-privado');
    expect(JSON.stringify(dossier)).not.toContain('No incluir');
    expect(v).toEqual(before);
  });

  it('informa HH por fase y capacidad referencial sin mezclarlas', () => {
    const v = makeVersion({
      totalHours: 45, netAmount: 135, totalAmount: 160.65,
      draft: {
        ...makeVersion().draft, phases: [
          { name: 'Portal', startWeek: 1, durationWeeks: 1,
            teamHours: [{ teamId: ids.team, hours: 45 }] },
        ],
      },
    });
    const dossier = report(v);
    expect(dossier.quotation.teams[0]?.capacityReferenceHours).toBe(80);
    expect(dossier.quotation.teams[0]?.quotedHours).toBe(45);
    expect(dossier.validation.summary.totalHours).toBe(45);
  });

  it('exporta hallazgos de un presupuesto incompleto sin convertirlo en oferta', () => {
    const v = makeVersion({ hourlyRate: null, netAmount: null, totalAmount: null });
    const dossier = report(v);
    expect(dossier.validation.contentChecksPassed).toBe(false);
    expect(dossier.validation.findings.some((f) => f.code === 'RATE_REQUIRED')).toBe(true);
    expect(dossier.deliveryEnabled).toBe(false);
  });

  it('rechaza una validación de otra revisión o versión', () => {
    const v = makeVersion();
    const check = buildQuotationCommercialPreflight(v, scope, operational, catalog, at);
    expect(() => buildQuotationCommercialDossier(
      { ...v, revision: 4 }, check, catalog, at,
    )).toThrow(/no corresponde/);
    expect(() => buildQuotationCommercialDossier(
      { ...v, id: ids.team }, check, catalog, at,
    )).toThrow(/no corresponde/);
  });

  it('identifica equipos eliminados o inactivos, conservando el bloqueo', () => {
    const dossier = report(makeVersion(), []);
    expect(dossier.quotation.teams[0]).toMatchObject({
      teamId: ids.team, name: null, isActive: false,
    });
    expect(dossier.validation.findings.some((f) => f.code === 'TEAM_UNAVAILABLE')).toBe(true);
    expect(dossier.deliveryEnabled).toBe(false);
  });
});
