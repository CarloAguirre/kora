import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail, SupportProjectDetailSummary } from '@kora/contracts';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { SupportProjectDetailView } from './SupportProjectDetailView';

const changeStatus = vi.fn().mockResolvedValue(undefined);
const closeContract = vi.fn().mockResolvedValue(undefined);
let canManage = true;
let summary: SupportProjectDetailSummary | null = null;
let summaryError: Error | null = null;

const activeSummary: SupportProjectDetailSummary = {
  planId: 'plan-1', planType: 'monthly', contractedHours: 10, planValueUf: 0,
  extraHourValueUf: 0, currency: 'UF', usedHours: 0, availableHours: null,
  currentPeriod: null, history: [],
};

vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => canManage && permission === 'projects:manage' }),
}));
vi.mock('@/modules/clients/api/clients.queries', () => ({ useClientDetail: () => ({ data: null }) }));
vi.mock('@/modules/tickets/api/tickets.queries', () => ({
  useTicketsList: () => ({ data: { items: [], total: 0 }, isLoading: false }),
}));
vi.mock('../api/projects.queries', () => ({
  useChangeProjectStatus: () => ({ mutateAsync: changeStatus, isPending: false }),
}));
vi.mock('../api/support-plan.queries', () => ({
  useSupportPlanSummary: () => ({ data: summary, isLoading: false, error: summaryError }),
  useCloseSupportPlan: () => ({ mutateAsync: closeContract, isPending: false }),
}));

const project = (status: ProjectDetail['status'] = 'on_hold') => ({
  id: 'project-1', name: 'Soporte CPT', type: 'support', status,
  client: { id: 'client-1', companyName: 'CPT' },
  primaryContact: null, quotationLink: null, contractLink: null, additionalLinks: null,
  commercialManager: null, leader: null, developer: null,
  startDate: '2026-01-01', endDate: '2026-12-31', soldHours: 10, overtimeRateUf: 0,
}) as ProjectDetail;

function renderDetail(status: ProjectDetail['status'] = 'on_hold') {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SupportProjectDetailView project={project(status)} projectId="project-1" />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SupportProjectDetailView — estados de soporte', () => {
  beforeEach(() => {
    canManage = true;
    summary = activeSummary;
    summaryError = null;
    changeStatus.mockClear();
    closeContract.mockClear();
  });

  it('muestra solo los tres estados de negocio y mantiene on_hold como Inactivo', () => {
    renderDetail();
    const select = screen.getByRole('combobox', { name: 'Cambiar estado' }) as HTMLSelectElement;
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(['Activo', 'Inactivo', 'Terminado']);
    expect(select.value).toBe('inactive');
    fireEvent.change(select, { target: { value: 'active' } });
    expect(changeStatus).toHaveBeenCalledWith({ projectId: 'project-1', input: { status: 'active' } });
  });

  it('al elegir Terminado pide cerrar el contrato y no cambia directamente el proyecto', async () => {
    renderDetail();
    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar estado' }), { target: { value: 'finished' } });
    const dialog = screen.getByRole('dialog', { name: 'Cerrar contrato' });
    expect(changeStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar contrato' }));
    await waitFor(() => expect(closeContract).toHaveBeenCalledWith(expect.objectContaining({ closeReason: 'Finalizado por cliente' })));
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it('sin contrato activo delega en la API la validación para terminar el soporte', () => {
    summary = null;
    renderDetail();
    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar estado' }), { target: { value: 'finished' } });
    expect(changeStatus).toHaveBeenCalledWith({ projectId: 'project-1', input: { status: 'finished' } });
    expect(closeContract).not.toHaveBeenCalled();
  });

  it('permite inactivar aunque falle la consulta del resumen, sin intentar terminar sin verificar el contrato', () => {
    summary = null;
    summaryError = new Error('Falló el resumen');
    renderDetail('active');
    const select = screen.getByRole('combobox', { name: 'Cambiar estado' }) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    fireEvent.change(select, { target: { value: 'finished' } });
    expect(changeStatus).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'inactive' } });
    expect(changeStatus).toHaveBeenCalledWith({ projectId: 'project-1', input: { status: 'on_hold' } });
  });

  it('muestra como Inactivo los estados heredados también en lectura', () => {
    canManage = false;
    renderDetail('cancelled');
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });
});
