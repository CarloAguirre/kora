import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildReconciliationReview, emptyReconciliationChoices, quotationTransferPreviewSchema } from '@kora/contracts';
import { QuotationReconciliationReviewCard } from './QuotationReconciliationReviewCard';

const mocks = vi.hoisted(() => ({ save: vi.fn(), assess: vi.fn(), history: [] as unknown[], assessments: [] as unknown[] }));
vi.mock('../api/quotation.queries', () => ({
  useQuotationReconciliationReviews: vi.fn(() => ({
    data: mocks.history, isLoading: false, isError: false,
  })),
  useQuotationReconciliationAssessments: vi.fn(() => ({
    data: mocks.assessments, isLoading: false, isError: false,
  })),
  useAssessQuotationReconciliation: vi.fn(() => ({
    isPending: false, mutateAsync: mocks.assess,
  })),
  useSaveQuotationReconciliationReview: vi.fn(() => ({
    isPending: false, mutateAsync: mocks.save,
  })),
}));

const preview = quotationTransferPreviewSchema.parse({
  projectId: '0777e456-fd76-445e-83f1-afc25061c101',
  versionId: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 1, revision: 3,
  calculatedAt: '2026-10-30T18:00:00.000Z', transferEnabled: false,
  proposed: {
    status: 'draft', origin: 'manual', aiReviewStatus: null,
    currency: 'UF', totalHours: 8, netAmount: null, totalAmount: null,
    hourlyRateDefined: false, paymentPercent: 0,
  },
  operational: {
    salesStage: 'quoted', status: 'active', soldHours: 12, usedHours: 5,
    startDate: null, contractAmount: null, contractCurrency: 'UF',
    moduleCount: 1, taskCount: 1, segmentCount: 0,
    milestoneCounts: { pending: 0, toInvoice: 0, invoiced: 0, paid: 0 },
  },
  difference: { soldHoursDelta: -4, remainingComparedToUsed: 3, netAmountDelta: null },
  teams: [],
  edtReconciliation: {
    source: 'analysis', activityCount: 1, proposedModuleCount: 1, proposedHours: 8,
    availableExistingModules: [{ id: '0777e456-fd76-445e-83f1-afc25061c103',
      name: 'Portal', estimatedHours: 10, tasks: [] }],
    modules: [{
      name: 'Portal', proposedHours: 8, matchStatus: 'possible_match',
      existingCandidates: [{ id: '0777e456-fd76-445e-83f1-afc25061c103',
        name: 'Portal', estimatedHours: 10, taskCount: 0 }],
      deltaVsExisting: -2,
      activities: [{
        wbs: 'T01.01', description: 'API', role: 'Fullstack',
        proposedHours: 8, possibleExistingTasks: [],
      }],
    }],
    notes: [],
  },
  findings: [{ code: 'R3_NOT_IMPLEMENTED', severity: 'blocker',
    message: 'No se puede transferir.' }],
  pendingDecisionIds: ['D04', 'D05', 'D06'],
});

beforeEach(() => {
  mocks.history = [];
  mocks.assessments = [];
  mocks.assess.mockReset().mockImplementation(async (input: { decision: string }) => ({
    id: '0777e456-fd76-445e-83f1-afc25061c108',
    decision: input.decision,
    status: 'technical_review_only', transferEnabled: false,
  }));
  mocks.save.mockReset().mockImplementation(async (review: unknown) => ({
    id: '0777e456-fd76-445e-83f1-afc25061c104',
    actorUserId: '0777e456-fd76-445e-83f1-afc25061c105',
    occurredAt: '2026-10-30T18:05:00.000Z',
    review,
  }));
});

describe('QuotationReconciliationReviewCard — persistencia de borradores', () => {
  it('permite guardar un acta de discusión sin transformarla en aprobación', async () => {
    render(<QuotationReconciliationReviewCard preview={preview} canSave />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acta en Kora' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const review = mocks.save.mock.calls[0]?.[0];
    expect(review.transferEnabled).toBe(false);
    expect(review.status).toBe('draft_for_discussion');
    expect(review.versionRevision).toBe(3);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Sigue pendiente de discusión/));
  });

  it('no permite guardar sin autorización, pero conserva la exportación JSON', () => {
    render(<QuotationReconciliationReviewCard preview={preview} canSave={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    expect(screen.getByRole('button', { name: 'Guardar acta en Kora' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar acta JSON de revisión' })).toBeEnabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('registra una evaluación técnica de la última acta con fundamento', async () => {
    const saved = {
      id: '0777e456-fd76-445e-83f1-afc25061c106',
      actorUserId: '0777e456-fd76-445e-83f1-afc25061c107',
      occurredAt: '2026-10-30T18:06:00.000Z',
      review: buildReconciliationReview(preview, emptyReconciliationChoices(),
        '2026-10-30T18:05:00.000Z'),
    };
    mocks.history = [saved];
    render(<QuotationReconciliationReviewCard preview={preview}
      canAssess currentUserId="0777e456-fd76-445e-83f1-afc25061c109" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    expect(screen.getByRole('button', { name: 'Registrar evaluación técnica' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Documenta qué verificaste/), {
      target: { value: 'Debemos resolver las actividades WBS pendientes.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar evaluación técnica' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledTimes(1));
    expect(mocks.assess.mock.calls[0]?.[0]).toMatchObject({
      reviewId: saved.id, versionRevision: 3, decision: 'changes_requested',
    });
    await waitFor(() => expect(screen.getByText(/Se registraron observaciones técnicas/)).toBeInTheDocument());
  });

  it('no permite evaluar la propia acta ni muestra aprobación contractual', () => {
    const actorId = '0777e456-fd76-445e-83f1-afc25061c107';
    mocks.history = [{
      id: '0777e456-fd76-445e-83f1-afc25061c106',
      actorUserId: actorId, occurredAt: '2026-10-30T18:06:00.000Z',
      review: buildReconciliationReview(preview, emptyReconciliationChoices(),
        '2026-10-30T18:05:00.000Z'),
    }];
    render(<QuotationReconciliationReviewCard preview={preview}
      canAssess currentUserId={actorId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    expect(screen.getByText(/No puedes evaluar un acta creada por ti mismo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobar cotización|Traspasar/i })).not.toBeInTheDocument();
    expect(mocks.assess).not.toHaveBeenCalled();
  });

});
