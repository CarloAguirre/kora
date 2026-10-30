import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { quotationVersionSchema, quotationTransferPreviewSchema } from '@kora/contracts';
import { QuotationTransferPreviewCard } from './QuotationTransferPreviewCard';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const versionId = '0777e456-fd76-445e-83f1-afc25061c102';
const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
const version = quotationVersionSchema.parse({
  id: versionId, quotationId: '0777e456-fd76-445e-83f1-afc25061c104',
  versionNumber: 1, name: 'Borrador', status: 'draft', origin: 'manual',
  aiReviewStatus: null, revision: 1,
  createdByUserId: '0777e456-fd76-445e-83f1-afc25061c105',
  hourlyRate: 2, currency: 'UF', tax: 'iva19', totalHours: 75,
  netAmount: 150, totalAmount: 178.5,
  draft: { mode: 'phases', teams: [{ teamId, collaborators: 1,
    unit: 'week', duration: 2, hoursPerWeek: 40, dedicationPercent: 50 }],
    phases: [{ name: 'Entrega', startWeek: 1, durationWeeks: 2,
      teamHours: [{ teamId, hours: 75 }] }],
    costs: [], paymentPlan: [], assumptions: [], exclusions: [], sourceRefs: [], answers: {} },
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
});
const preview = quotationTransferPreviewSchema.parse({
  projectId, versionId, versionNumber: 1, revision: 1,
  calculatedAt: '2026-10-30T18:00:00.000Z',
  transferEnabled: false,
  proposed: {
    status: 'draft', origin: 'manual', aiReviewStatus: null,
    currency: 'UF', totalHours: 75, netAmount: 150, totalAmount: 178.5,
    hourlyRateDefined: true, paymentPercent: 0,
  },
  operational: {
    salesStage: 'quoted', status: 'active', soldHours: 100, usedHours: 80,
    startDate: '2026-09-01', contractAmount: 500, contractCurrency: 'UF',
    moduleCount: 3, taskCount: 5, segmentCount: 2,
    milestoneCounts: { pending: 0, toInvoice: 1, invoiced: 0, paid: 1 },
  },
  difference: { soldHoursDelta: -25, remainingComparedToUsed: -5, netAmountDelta: null },
  teams: [{
    teamId, name: 'Desarrollo', currentAssignedHours: 50,
    proposedHours: 75, delta: 25, existsInProject: true,
  }],
  edtReconciliation: {
    source: 'analysis', activityCount: 1, proposedModuleCount: 1, proposedHours: 75,
    modules: [{
      name: 'Portal', proposedHours: 75, matchStatus: 'possible_match',
      deltaVsExisting: 5,
      existingCandidates: [{
        id: '0777e456-fd76-445e-83f1-afc25061c108',
        name: 'Portal', estimatedHours: 70, taskCount: 1,
      }],
      activities: [{
        wbs: 'T01.01', description: 'Construir endpoint', role: 'Fullstack',
        proposedHours: 75, possibleExistingTasks: [],
      }],
    }],
    notes: ['La coincidencia es por nombre.'],
  },
  findings: [{ code: 'R3_NOT_IMPLEMENTED', severity: 'blocker',
    message: 'Traspaso todavía bloqueado.' },
    { code: 'HISTORICAL_HOURS', severity: 'review', message: 'Hay HH históricas.' }],
  pendingDecisionIds: ['D04', 'D05', 'D06'],
});
const refresh = vi.fn();
vi.mock('../api/quotation.queries', () => ({
  useQuotationTransferPreview: vi.fn(() => ({
    data: preview, isLoading: false, isError: false,
    isFetching: false, refetch: refresh,
  })),
  useQuotationReconciliationReviews: vi.fn(() => ({
    data: [], isLoading: false, isError: false,
  })),
  useQuotationReconciliationAssessments: vi.fn(() => ({
    data: [], isLoading: false, isError: false,
  })),
  useAssessQuotationReconciliation: vi.fn(() => ({
    isPending: false, mutateAsync: vi.fn(),
  })),
  useSaveQuotationReconciliationReview: vi.fn(() => ({
    isPending: false, mutateAsync: vi.fn(),
  })),
}));

describe('QuotationTransferPreviewCard', () => {
  it('solo carga detalle al abrir y deja visible que el traspaso está deshabilitado', () => {
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map([[teamId, 'Desarrollo']])} />);
    expect(screen.queryByText('Traspaso deshabilitado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    expect(screen.getByText('Traspaso deshabilitado')).toBeInTheDocument();
    expect(screen.getByText('R3_NOT_IMPLEMENTED', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aplicar traspaso/i })).not.toBeInTheDocument();
  });

  it('distingue HH propuestas de horas consumidas y mantiene la comparación por equipo', () => {
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map([[teamId, 'Desarrollo']])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    const rows = screen.getAllByRole('row');
    const teamRow = rows.find((row) => within(row).queryByText('Desarrollo'));
    expect(teamRow).toBeDefined();
    expect(within(teamRow!).getByText('75')).toBeInTheDocument();
    expect(within(teamRow!).getByText('+25')).toBeInTheDocument();
    expect(screen.getByText('HH consumidas')).toBeInTheDocument();
    expect(screen.getByText('Pagados: 1', { exact: false })).toBeInTheDocument();
  });

  it('muestra WBS y coincidencias sin acciones de modificación', () => {
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    expect(screen.getAllByText('Portal', { exact: true }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Actividades WBS (1)'));
    expect(screen.getByText('T01.01')).toBeInTheDocument();
    expect(screen.getByText(/La coincidencia es por nombre/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Traspasar|Crear tareas|Sincronizar EDT/i }))
      .not.toBeInTheDocument();
  });

  it('permite preparar un acta local sin botones de escritura en BD', () => {
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    expect(screen.getByText(/Módulos revisados: 0\/1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar acta JSON de revisión' })).toBeInTheDocument();
    expect(screen.getByText(/Guardar un acta no aprueba ni traspasa HH/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aplicar traspaso|Aprobar cotización/ }))
      .not.toBeInTheDocument();
  });

  it('mantiene el guardado deshabilitado sin autorización y no habilita transferencia', () => {
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map()} canSaveReview={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar acta' }));
    expect(screen.getByRole('button', { name: 'Guardar acta en Kora' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Aplicar traspaso/i })).not.toBeInTheDocument();
  });

  it('actualiza solo la lectura al solicitarlo', () => {
    refresh.mockClear();
    render(<QuotationTransferPreviewCard projectId={projectId} version={version}
      teamNames={new Map()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar conflictos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar lectura' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
