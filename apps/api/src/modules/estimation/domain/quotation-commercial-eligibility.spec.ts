import { describe, expect, it } from 'vitest';
import { assertQuotationReadyForClient, assertAiProposalReadyToAccept, assertDirectClientApprovalAcknowledged } from './quotation-commercial-eligibility';
import type { QuotationVersion } from '@kora/contracts';
const base = () => ({
  hourlyRate: 1, totalHours: 40, netAmount: 40, totalAmount: 47.6,
  origin: 'manual' as const, aiReviewStatus: null,
  draft: {
    mode: 'team', teams: [{ teamId: 'team-id', collaborators: 1, unit: 'week',
      duration: 1, hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [], costs: [],
    paymentPlan: [
      { name: 'Inicio', percent: 50, trigger: 'approval' },
      { name: 'Final', percent: 50, trigger: 'phase', triggerPhase: 'pilot' },
    ],
    assumptions: [], exclusions: [], sourceRefs: [], answers: {},
  },
}) as unknown as QuotationVersion;
describe('Transiciones comerciales', () => {
  it('requiere confirmación adicional al aprobar un borrador sin marcarlo enviado', () => {
    expect(() => assertDirectClientApprovalAcknowledged('draft', undefined))
      .toThrow(/confirmar explícitamente/);
    expect(() => assertDirectClientApprovalAcknowledged('draft', true)).not.toThrow();
    expect(() => assertDirectClientApprovalAcknowledged('sent', undefined)).not.toThrow();
  });
  it('exige HH valorizadas y plan de pagos 100%', () => {
    expect(() => assertQuotationReadyForClient(base())).not.toThrow();
    expect(() => assertQuotationReadyForClient({ ...base(), hourlyRate: null })).toThrow(/valor HH/);
    expect(() => assertQuotationReadyForClient({ ...base(),
      draft: { ...base().draft, paymentPlan: [{ name:'Inicio',percent:50,trigger:'approval' }] } }))
      .toThrow(/100/);
    expect(() => assertQuotationReadyForClient({ ...base(), totalHours: 0 })).toThrow(/equipos/);
  });
  it('acepta la EDT ajustada cuando el presupuesto concilia y bloquea totales falsos', () => {
    const current = base();
    const adjusted = {
      ...current,
      origin: 'ai' as const, aiReviewStatus: 'accepted' as const,
      totalHours: 45, netAmount: 45, totalAmount: 53.55,
      draft: {
        ...current.draft,
        mode: 'phases' as const,
        teams: current.draft.teams,
        phases: [{ name: 'Desarrollo', startWeek: 1, durationWeeks: 1,
          teamHours: [{ teamId: 'team-id', hours: 45 }] }],
        analysisProjectionStatus: 'synced' as const,
        edtHourAdjustments: [{ wbs: '1.1', role: 'Desarrollo', hours: 45 }],
        aiPoc: {
          source: 'kdm_demo' as const,
          edt: {
            schemaVersion: 'kora.quotation.reference-edt.v1' as const,
            source: 'kdm_demo' as const, provider: 'gemini' as const,
            modules: [{ name: 'Portal', totalHours: 40, tasks: [
              { wbs: '1.1', role: 'Desarrollo', name: 'API', description: 'Servicio',
                hours: 40 },
            ] }],
            totalHours: 40,
          },
          proposal: { roles: [{ role: 'Desarrollo' }] },
          roleTeamIds: { Desarrollo: 'team-id' },
        },
      },
    } as unknown as QuotationVersion;
    expect(() => assertQuotationReadyForClient(adjusted)).not.toThrow();
    expect(() => assertQuotationReadyForClient({ ...adjusted, totalHours: 40 }))
      .toThrow(/conciliar/);
    expect(() => assertAiProposalReadyToAccept({
      ...adjusted, aiReviewStatus: 'pending',
    })).not.toThrow();
  });

  it('distingue aceptación IA de aprobación comercial', () => {
    expect(() => assertQuotationReadyForClient({ ...base(), origin:'ai', aiReviewStatus:'pending' }))
      .toThrow(/acepta la propuesta/);
    expect(() => assertQuotationReadyForClient({ ...base(), origin:'ai',
      aiReviewStatus:'accepted',
      draft: { ...base().draft, aiPoc: { edt: { modules: [] } },
        analysisProjectionStatus: 'modified' } } as unknown as QuotationVersion))
      .toThrow(/Concilia la planificación/);
    expect(() => assertAiProposalReadyToAccept({ ...base(), origin:'ai',
      aiReviewStatus:'pending' })).toThrow(/asigna/);
  });
});
