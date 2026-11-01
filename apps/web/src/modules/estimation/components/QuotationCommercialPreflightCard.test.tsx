import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { quotationCommercialPreflightSchema, quotationVersionSchema } from '@kora/contracts';
import { QuotationCommercialPreflightCard } from './QuotationCommercialPreflightCard';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const versionId = '0777e456-fd76-445e-83f1-afc25061c102';
const teamId = '0777e456-fd76-445e-83f1-afc25061c103';

const version = quotationVersionSchema.parse({
  id: versionId, quotationId: '0777e456-fd76-445e-83f1-afc25061c104',
  versionNumber: 2, revision: 5, name: 'Propuesta comercial',
  status: 'draft', origin: 'manual', aiReviewStatus: null,
  createdByUserId: '0777e456-fd76-445e-83f1-afc25061c105',
  hourlyRate: 2, currency: 'UF', tax: 'iva19',
  totalHours: 80, netAmount: 160, totalAmount: 190.4,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  draft: { mode: 'team', teams: [{ teamId, collaborators: 1,
    unit: 'week', duration: 2, hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [], costs: [],
    paymentPlan: [{ name: 'Firma', percent: 100, trigger: 'approval' }],
    assumptions: [], exclusions: [], sourceRefs: [], answers: {},
  },
});
const result = quotationCommercialPreflightSchema.parse({
  projectId, versionId, versionNumber: 2, revision: 5,
  calculatedAt: '2026-11-01T13:30:00.000Z',
  sendEnabled: false,
  contentChecksPassed: false, blockerCount: 2, warningCount: 1,
  summary: {
    mode: 'team', teamCount: 1, phaseCount: 0, totalHours: 80,
    paymentPercent: 50, netAmount: 160, totalAmount: 190.4,
  },
  findings: [
    { code: 'PAYMENT_PLAN_NOT_100', section: 'payments', severity: 'blocker',
      message: 'El plan suma solo 50 %.' },
    { code: 'RATE_REQUIRED', section: 'pricing', severity: 'blocker',
      message: 'Tarifa pendiente.' },
    { code: 'TAX_POLICY_PENDING', section: 'policy', severity: 'warning',
      message: 'Definiciones comerciales pendientes.' },
  ],
  pendingDecisionIds: ['D02', 'D05', 'D06'],
});
const refresh = vi.fn();
const mockQuery = vi.fn((_: string, __: string, ___: number, enabled: boolean) => ({
  data: enabled ? result : undefined,
  isLoading: false, isError: false, isFetching: false,
  refetch: refresh,
}));
vi.mock('../api/quotation.queries', () => ({
  useQuotationCommercialPreflight: (...args: [string, string, number, boolean]) => mockQuery(...args),
}));

describe('QuotationCommercialPreflightCard (R3-f)', () => {
  it('carga bajo demanda y exhibe bloqueos sin permitir envío', () => {
    mockQuery.mockClear();
    render(<QuotationCommercialPreflightCard projectId={projectId} version={version} />);
    expect(screen.queryByText('PAYMENT_PLAN_NOT_100', { exact: false })).not.toBeInTheDocument();
    expect(mockQuery).toHaveBeenCalledWith(projectId, versionId, 5, false);
    fireEvent.click(screen.getByRole('button', { name: 'Validar cotización' }));
    expect(mockQuery).toHaveBeenCalledWith(projectId, versionId, 5, true);
    expect(screen.getByText('Bloqueo · Plan de pagos · PAYMENT_PLAN_NOT_100')).toBeInTheDocument();
    expect(screen.getByText('Advertencia · Reglas pendientes · TAX_POLICY_PENDING')).toBeInTheDocument();
    expect(screen.getByText('Envío deshabilitado.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar cotización|Aprobar|Traspasar/i }))
      .not.toBeInTheDocument();
  });

  it('advierte cambios no persistidos y permite refrescar SOLO una lectura', () => {
    refresh.mockClear();
    render(<QuotationCommercialPreflightCard projectId={projectId}
      version={version} hasUnsavedChanges />);
    fireEvent.click(screen.getByRole('button', { name: 'Validar cotización' }));
    expect(screen.getByText(/Hay cambios sin guardar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar validación' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
