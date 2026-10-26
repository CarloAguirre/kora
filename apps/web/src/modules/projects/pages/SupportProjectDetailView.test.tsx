import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { SupportProjectDetailView } from './SupportProjectDetailView';

const changeStatus = vi.fn().mockResolvedValue(undefined);
const closeContract = vi.fn().mockResolvedValue(undefined);
let canManage = true;
let plans: Array<{ id: string; projectId: string; status: 'active' | 'ended' }> = [];

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
  useSupportPlanSummary: () => ({ data: null, isLoading: false }),
  useSupportPlansForClient: () => ({ data: plans, error: null }),
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
    plans = [{ id: 'plan-1', projectId: 'project-1', status: 'active' }];
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

  it('puede reconciliar un proyecto inactivo cuyo contrato ya está cerrado', () => {
    plans = [{ id: 'plan-1', projectId: 'project-1', status: 'ended' }];
    renderDetail();
    fireEvent.change(screen.getByRole('combobox', { name: 'Cambiar estado' }), { target: { value: 'finished' } });
    expect(changeStatus).toHaveBeenCalledWith({ projectId: 'project-1', input: { status: 'finished' } });
    expect(closeContract).not.toHaveBeenCalled();
  });

  it('no ofrece Terminado si no hay un contrato cerrado ni deja reactivar uno terminado sin contrato', () => {
    plans = [];
    renderDetail();
    const select = screen.getByRole('combobox', { name: 'Cambiar estado' }) as HTMLSelectElement;
    expect(select.options[0]?.disabled).toBe(true);
    expect(select.options[2]?.disabled).toBe(true);
  });

  it('si hay más de un contrato activo exige cerrar cada uno desde su ficha', () => {
    plans = [
      { id: 'plan-1', projectId: 'project-1', status: 'active' },
      { id: 'plan-2', projectId: 'project-1', status: 'active' },
    ];
    renderDetail();
    const select = screen.getByRole('combobox', { name: 'Cambiar estado' }) as HTMLSelectElement;
    expect(select.options[2]?.disabled).toBe(true);
    expect(screen.getByText('Cierra los contratos activos para terminar este soporte.')).toBeInTheDocument();
  });

  it('muestra como Inactivo los estados heredados también en lectura', () => {
    canManage = false;
    renderDetail('cancelled');
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });
});
