import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectDetail, ProjectQuotation, QuotationVersion } from '@kora/contracts';
import { QuotationCommercialLifecycleCard } from './QuotationCommercialLifecycleCard';

const mocks = vi.hoisted(() => ({
  acceptAi: vi.fn(), markSent: vi.fn(), approveClient: vi.fn(), transferApproved: vi.fn(),
}));
vi.mock('../api/quotation.queries', () => ({
  useQuotationLifecycle: () => ({
    acceptAi: { mutateAsync: mocks.acceptAi, isPending: false },
    markSent: { mutateAsync: mocks.markSent, isPending: false },
    approveClient: { mutateAsync: mocks.approveClient, isPending: false },
    transferApproved: { mutateAsync: mocks.transferApproved, isPending: false },
  }),
}));

const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  name: 'Motor de notificaciones',
  status: 'draft', salesStage: 'quoted',
} as unknown as ProjectDetail;
const version = {
  id: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 1, revision: 3, origin: 'ai', aiReviewStatus: 'pending',
  status: 'draft', hourlyRate: 1, currency: 'UF',
  totalHours: 40, netAmount: 40, totalAmount: 47.6,
  draft: {
    teams: [{ teamId: '0777e456-fd76-445e-83f1-afc25061c103' }],
    paymentPlan: [
      { name: 'Inicio', percent: 50, trigger: 'approval' },
      { name: 'Cierre', percent: 50, trigger: 'phase', triggerPhase: 'pilot' },
    ],
    aiPoc: { source: 'kdm_demo' }, analysisProjectionStatus: 'synced',
  },
} as unknown as QuotationVersion;
const quotation = {
  projectId: project.id,
  versions: [version],
  transferredVersionId: null,
} as ProjectQuotation;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.acceptAi.mockResolvedValue({ ...version, aiReviewStatus: 'accepted', revision: 4 });
  mocks.markSent.mockResolvedValue({ ...version, status: 'sent', revision: 5 });
  mocks.approveClient.mockResolvedValue({ ...version, status: 'approved', revision: 6 });
  mocks.transferApproved.mockResolvedValue({ versionId: version.id });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

const show = (v = version, proj = project, unsaved = false) =>
  render(<QuotationCommercialLifecycleCard project={proj} quotation={quotation}
    version={v} canOperate hasUnsavedChanges={unsaved}/>);

describe('Ciclo comercial separado · Kora', () => {
  it('aceptar IA nunca invoca traspaso o aprobación de cliente', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar propuesta IA' }));
    await waitFor(() => expect(mocks.acceptAi).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    expect(mocks.transferApproved).not.toHaveBeenCalled();
    expect(mocks.approveClient).not.toHaveBeenCalled();
  });

  it('una versión revisada puede marcarse enviada y se registra sin correo', async () => {
    show({ ...version, aiReviewStatus: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como enviada' }));
    await waitFor(() => expect(mocks.markSent).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('NO envía correos'),
    );
  });

  it('la aprobación con traspaso después no altera el proyecto', async () => {
    show({ ...version, aiReviewStatus: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación' }));
    await waitFor(() => expect(mocks.approveClient).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    expect(mocks.transferApproved).not.toHaveBeenCalled();
  });

  it('versión aprobada muestra traspaso pendiente, bloqueado si ya está Activo', () => {
    show({ ...version, status: 'approved', aiReviewStatus: 'accepted' },
      { ...project, status: 'active' });
    expect(screen.getByRole('button', { name: 'Traspasar ahora' })).toBeDisabled();
    expect(screen.getByText(/La versión aprobada permanece registrada/)).toBeInTheDocument();
  });

  it('no permite acción comercial con cambios sin guardar', () => {
    show({ ...version, aiReviewStatus: 'accepted' }, project, true);
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registrar aprobación' })).toBeDisabled();
  });
});
