import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectDetail, ProjectQuotation, QuotationVersion } from '@kora/contracts';
import { QuotationCommercialLifecycleCard } from './QuotationCommercialLifecycleCard';
import buttonStyles from '@/shared/components/ui/Button.module.css';

const mocks = vi.hoisted(() => ({
  acceptAi: vi.fn(), markSent: vi.fn(), approveClient: vi.fn(), transferApproved: vi.fn(),
  toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
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
  teams: [{ teamId: '0777e456-fd76-445e-83f1-afc25061c103',
    teamName: 'Desarrollo' }],
} as unknown as ProjectDetail;
const version = {
  id: '0777e456-fd76-445e-83f1-afc25061c102',
  versionNumber: 1, revision: 3, origin: 'ai', aiReviewStatus: 'pending',
  status: 'draft', hourlyRate: 1, currency: 'UF',
  totalHours: 40, netAmount: 40, totalAmount: 47.6,
  draft: {
    mode: 'team',
    teams: [{ teamId: '0777e456-fd76-445e-83f1-afc25061c103',
      collaborators: 1, unit: 'week', duration: 1,
      hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [],
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
});
afterEach(() => vi.restoreAllMocks());

const show = (v = version, proj = project, unsaved = false) =>
  render(<QuotationCommercialLifecycleCard project={proj} quotation={quotation}
    version={v} canOperate hasUnsavedChanges={unsaved}/>);

describe('Ciclo comercial separado · Kora', () => {
  it('en resumen v5 solo muestra los dos botones comerciales y conserva sus guards', () => {
    render(<QuotationCommercialLifecycleCard project={project} quotation={quotation}
      version={{ ...version, aiReviewStatus: 'accepted' }} canOperate
      hasUnsavedChanges={false} embedded showAiAcceptance={false} />);
    const requiredClass = (value: string | undefined) => {
      if (!value) throw new Error('Clase compartida Button ausente');
      return value;
    };
    expect(screen.getByRole('button', { name: 'Marcar como enviada al cliente' }))
      .toBeEnabled();
    expect(screen.getByRole('button', { name: 'Marcar como enviada al cliente' }))
      .toHaveClass(requiredClass(buttonStyles.outline));
    expect(screen.getByRole('button', { name: 'Registrar aprobación del cliente' }))
      .toBeEnabled();
    expect(screen.getByRole('button', { name: 'Registrar aprobación del cliente' }))
      .toHaveClass(requiredClass(buttonStyles.secondary));
    expect(screen.queryByText('Ciclo comercial de la cotización')).not.toBeInTheDocument();
    expect(screen.queryByText('Opciones de aprobación y traspaso')).not.toBeInTheDocument();
    expect(screen.queryByText('La fuente documental es el PDF KDM de prueba.'))
      .not.toBeInTheDocument();
  });

  it('explica el motivo preciso: falta aceptar Gemini aun con HH, tarifa y plan 100%', () => {
    render(<QuotationCommercialLifecycleCard project={project} quotation={quotation}
      version={version} canOperate hasUnsavedChanges={false}
      embedded showAiAcceptance={false}/>);
    expect(screen.getByRole('button', { name: 'Registrar aprobación del cliente' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación del cliente' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Acepta la propuesta IA'));
    expect(mocks.approveClient).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.stringContaining('Completa el plan de pago'));
    expect(screen.queryByRole('status', { name: 'Requisitos comerciales pendientes' }))
      .not.toBeInTheDocument();
  });

  it('muestra cada bloqueo comercial restante sin depender del tooltip', () => {
    render(<QuotationCommercialLifecycleCard project={project} quotation={quotation}
      version={{ ...version, hourlyRate: null,
        draft: { ...version.draft, paymentPlan: [{ name: 'Inicio', percent: 50,
          trigger: 'approval' }] } }} canOperate hasUnsavedChanges
      embedded showAiAcceptance={false}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación del cliente' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Guarda los cambios del borrador.'));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Ingresa y guarda un valor HH'));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('50% de 100%'));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Acepta la propuesta IA'));
    expect(screen.queryByRole('status', { name: 'Requisitos comerciales pendientes' }))
      .not.toBeInTheDocument();
  });

  it('resumen v5 bloquea envío y aprobación mientras haya cambios sin guardar', () => {
    render(<QuotationCommercialLifecycleCard project={project} quotation={quotation}
      version={{ ...version, aiReviewStatus: 'accepted' }} canOperate
      hasUnsavedChanges embedded showAiAcceptance={false} />);
    expect(screen.getByRole('button', { name: 'Marcar como enviada al cliente' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Registrar aprobación del cliente' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación del cliente' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Guarda los cambios'));
    expect(mocks.approveClient).not.toHaveBeenCalled();
  });

  it('aceptar IA nunca invoca traspaso o aprobación de cliente', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar propuesta IA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar propuesta' }));
    await waitFor(() => expect(mocks.acceptAi).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    expect(mocks.transferApproved).not.toHaveBeenCalled();
    expect(mocks.approveClient).not.toHaveBeenCalled();
  });

  it('una versión revisada puede marcarse enviada y se registra sin correo', async () => {
    show({ ...version, aiReviewStatus: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como enviada' }));
    expect(screen.getByText('Registrar envío comercial')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar envío' }));
    await waitFor(() => expect(mocks.markSent).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Envío registrado. La versión quedó bloqueada.'));
  });

  it('la aprobación con traspaso después no altera el proyecto', async () => {
    show({ ...version, status: 'sent', aiReviewStatus: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/Aprobar y traspasar después/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar aprobación' }));
    await waitFor(() => expect(mocks.approveClient).toHaveBeenCalledWith({
      versionId: version.id, revision: 3,
    }));
    expect(mocks.transferApproved).not.toHaveBeenCalled();
  });

  it('versión aprobada muestra traspaso pendiente, bloqueado si ya está Activo', () => {
    show({ ...version, status: 'approved', aiReviewStatus: 'accepted' },
      { ...project, status: 'active' });
    expect(screen.getByRole('button', { name: 'Traspasar ahora' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Traspasar ahora' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('requiere conciliación'));
    expect(mocks.transferApproved).not.toHaveBeenCalled();
    expect(screen.getByText(/La versión aprobada permanece registrada/)).toBeInTheDocument();
  });

  it('permite aprobar un borrador sin envío solo con advertencia y confirmación reforzada', async () => {
    show({ ...version, aiReviewStatus: 'accepted' });
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeEnabled();
    expect(screen.getByText(/No hay envío comercial registrado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/no fue marcada como enviada al cliente/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar aprobación' }));
    await waitFor(() => expect(mocks.approveClient).toHaveBeenCalledWith({
      versionId: version.id, revision: 3, confirmWithoutSend: true,
    }));
    // Aprobar ahora abre el resumen; NO traspasa hasta confirmar por segunda vez.
    expect(await screen.findByText('Traspasar a la ficha del proyecto')).toBeInTheDocument();
    expect(mocks.transferApproved).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Traspasar' }));
    await waitFor(() => expect(mocks.transferApproved).toHaveBeenCalledWith({
      versionId: version.id, revision: 6,
    }));
  });

  it('si se cancela la advertencia del borrador, no registra aprobación', () => {
    show({ ...version, aiReviewStatus: 'accepted' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(mocks.approveClient).not.toHaveBeenCalled();
  });

  it('no permite acciones comerciales con cambios sin guardar', () => {
    show({ ...version, status: 'sent', aiReviewStatus: 'accepted' }, project, true);
    expect(screen.getByRole('button', { name: 'Registrar aprobación' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aprobación' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Guarda los cambios'));
    expect(mocks.approveClient).not.toHaveBeenCalled();
  });

  it('no permite enviar cuando la EDT ya no concuerda con las HH ajustadas', () => {
    show({ ...version, aiReviewStatus: 'accepted',
      draft: { ...version.draft,
        aiPoc: { ...version.draft.aiPoc!,
          edt: {
            schemaVersion: 'kora.quotation.reference-edt.v1',
            source: 'kdm_demo',
            provider: 'gemini',
            modules: [],
            totalHours: 0,
          },
        },
        analysisProjectionStatus: 'modified',
      },
    });
    expect(screen.getByRole('button', { name: 'Marcar como enviada' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como enviada' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Concilia la EDT'));
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(screen.getByText(/Concilia la EDT antes de registrar un envío/)).toBeInTheDocument();
  });
});
