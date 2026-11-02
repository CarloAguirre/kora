import { describe, expect, it } from 'vitest';
import { assertQuotationReadyForClient, assertAiProposalReadyToAccept } from './quotation-commercial-eligibility';
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
  it('exige HH valorizadas y plan de pagos 100%', () => {
    expect(() => assertQuotationReadyForClient(base())).not.toThrow();
    expect(() => assertQuotationReadyForClient({ ...base(), hourlyRate: null })).toThrow(/valor HH/);
    expect(() => assertQuotationReadyForClient({ ...base(),
      draft: { ...base().draft, paymentPlan: [{ name:'Inicio',percent:50,trigger:'approval' }] } }))
      .toThrow(/100/);
    expect(() => assertQuotationReadyForClient({ ...base(), totalHours: 0 })).toThrow(/equipos/);
  });
  it('distingue aceptación IA de aprobación comercial', () => {
    expect(() => assertQuotationReadyForClient({ ...base(), origin:'ai', aiReviewStatus:'pending' }))
      .toThrow(/acepta la propuesta/);
    expect(() => assertQuotationReadyForClient({ ...base(), origin:'ai',
      aiReviewStatus:'accepted',
      draft: { ...base().draft, aiPoc: { edt: { modules: [] } },
        analysisProjectionStatus: 'modified' } } as QuotationVersion))
      .toThrow(/Concilia la planificación/);
    expect(() => assertAiProposalReadyToAccept({ ...base(), origin:'ai',
      aiReviewStatus:'pending' })).toThrow(/asigna/);
  });
});
