import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectDetail } from '@kora/contracts';
import { EditProjectDialog, type EditProjectDialogProps } from './EditProjectDialog';
import { ToastProvider } from '@/shared/components/ui/Toast';

function renderDialog(props: EditProjectDialogProps) {
  return render(
    <ToastProvider>
      <EditProjectDialog {...props} />
    </ToastProvider>,
  );
}

const mutateAsync = vi.fn().mockResolvedValue(undefined);

const changeStatusMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../api/projects.queries', () => ({
  useUpdateProject: () => ({ mutateAsync }),
  useChangeProjectStatus: () => ({ mutateAsync: changeStatusMutateAsync }),
  useSetProjectOvertimeAuthorization: () => ({ mutateAsync: vi.fn() }),
  useCreateProjectModule: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectModule: () => ({ mutateAsync: vi.fn() }),
  useDeleteProjectModule: () => ({ mutateAsync: vi.fn() }),
  useAddProjectModuleDelivery: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveProjectModuleDelivery: () => ({ mutateAsync: vi.fn() }),
  useCreateProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProjectModuleSegment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProjectModuleSegment: () => ({ mutateAsync: vi.fn() }),
  useProjectsList: () => ({ data: { items: [] } }),
}));

vi.mock('../api/support-plan.queries', () => ({
  useSupportPlansForClient: () => ({ data: [] }),
  useSupportPlanDetail: () => ({ data: undefined }),
  useUpdateSupportPlan: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/modules/clients/api/clients.queries', () => ({
  useClientsList: () => ({
    data: { items: [{ id: '11111111-1111-4111-8111-111111111111', companyName: 'Cliente SA' }] },
  }),
}));

const useUsersListMock = vi.fn(() => ({ data: { items: [] } }) as { data: { items: { id: string; fullName: string }[] } | undefined });

vi.mock('@/modules/users/api/users.queries', () => ({
  useUsersList: (...args: unknown[]) => useUsersListMock(...(args as [])),
}));

vi.mock('@/modules/forecast/api/forecast.queries', () => ({
  useForecastLoadPreview: () => ({ data: undefined }),
  useCheckForecastOverload: () => async () => [],
}));

vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHolidays: () => ({ data: [] }),
}));

vi.mock('@/modules/teams/api/teams.queries', () => ({
  useTeamsList: () => ({ data: { items: [] } }),
  useTeamDetail: () => ({ data: undefined, isLoading: false }),
}));

function buildProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'project-1',
    name: 'Proyecto de prueba',
    slug: 'proyecto-de-prueba',
    client: { id: '11111111-1111-4111-8111-111111111111', companyName: 'Cliente SA' },
    type: 'development',
    salesStage: 'approved',
    status: 'active',
    phase: 'development',
    priority: 'high',
    leader: null,
    soldHours: 500,
    usedHours: 629,
    assignedMemberCount: 0,
    plannedHours: 0,
    startDate: '2026-01-01',
    endDate: null,
    progress: { actual: 40, expected: 50, consumption: 126, delay: 10, planCoverage: 100, estimatedByCount: false },
    supportPlanDescription: null,
    supportHours: 0,
    allowsOvertime: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    developer: null,
    commercialManager: null,
    primaryContact: null,
    estimatedDeliveryDate: null,
    overtimeRateUf: 0,
    canAuthorizeOvertime: false,
    quotationLink: null,
    contractLink: null,
    additionalLinks: null,
    onHoldReason: null,
    stopsClock: false,
    scopeNotes: null,
    deliveryDocumentation: null,
    demoLink: null,
    testEnvironmentLink: null,
    figmaLink: null,
    documentationLink: null,
    impactBeforeHours: null,
    impactBeforePeople: null,
    impactBeforeDuration: null,
    impactBeforeModality: null,
    impactAfterHours: null,
    impactAfterPeople: null,
    impactAfterDuration: null,
    impactAfterModality: null,
    qaTestingStartDate: null,
    qaTestingEndDate: null,
    qaEvaluatedModule: null,
    qaPlannedTests: null,
    qaExecutedTests: null,
    qaFailedTests: null,
    periodReportDate: null,
    periodReportAchievements: null,
    usedHoursUpdatedAt: null,
    leaderLastActivityAt: null,
    prospectPhaseHours: 0,
    contractAmount: null,
    contractCurrency: 'UF',
    paymentMilestones: [],
    pendingManagementApproval: false,
    hito0At: null,
    hito0Source: null,
    hito0Reason: null,
    teams: [],
    members: [],
    observations: [],
    modules: [],
    legacyId: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EditProjectDialog', () => {
  beforeEach(() => {
    useUsersListMock.mockReturnValue({ data: { items: [] } });
  });

  it('precarga el formulario con los datos actuales del proyecto', () => {
    renderDialog({ open: true, project: buildProject(), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: true });

    expect(screen.getByLabelText(/Nombre del proyecto/)).toHaveValue('Proyecto de prueba');
    expect(screen.getByLabelText('HH vendidas')).toHaveValue(500);
  });

  it('bloquea "Líder Kabeli a cargo" cuando el actor no puede reasignar el proyecto (solo Gerencia/PMO puede)', () => {
    renderDialog({ open: true, project: buildProject(), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: false });

    expect(screen.getByLabelText('Líder Kabeli a cargo')).toBeDisabled();
    expect(screen.getByText('Solo Gerencia/PMO puede reasignar el proyecto a otro líder.')).toBeInTheDocument();
  });

  it('muestra el líder ya asignado aunque la lista de líderes cargue después del primer render', () => {
    // Simula la carrera real: al montar, `useUsersList` todavía no tiene datos (como en el primer
    // render de una query en curso); el select no debe quedarse pegado en "Sin asignar" cuando la
    // lista llega después — antes de controlar el campo con `value`/`onChange`, exactamente eso pasaba.
    useUsersListMock.mockReturnValue({ data: undefined });
    const { rerender } = renderDialog({
      open: true,
      project: buildProject({ leader: { id: 'leader-1', fullName: 'José Aponte' } }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    expect(screen.getByLabelText('Líder Kabeli a cargo')).toHaveValue('');

    useUsersListMock.mockReturnValue({ data: { items: [{ id: 'leader-1', fullName: 'José Aponte' }] } });
    rerender(
      <ToastProvider>
        <EditProjectDialog
          open
          project={buildProject({ leader: { id: 'leader-1', fullName: 'José Aponte' } })}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          isManagement
        />
      </ToastProvider>,
    );

    expect(screen.getByLabelText('Líder Kabeli a cargo')).toHaveValue('leader-1');
  });

  it('muestra "Responsable comercial" también para un proyecto ya aprobado', () => {
    renderDialog({ open: true, project: buildProject(), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: true });

    expect(screen.getByLabelText(/Responsable comercial/)).toBeInTheDocument();
  });

  it('muestra "Responsable comercial" mientras el proyecto está en prospecto/cotización', () => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage: 'prospect' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    expect(screen.getByLabelText(/Responsable comercial/)).toBeInTheDocument();
  });

  it.each(['prospect', 'quoted'] as const)('en %s el Estado solo ofrece "—" (sin estado) y Detenido, sin "No iniciado"', (salesStage) => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage, status: 'draft', phase: null }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    const labels = Array.from(estado.options).map((option) => option.textContent);
    expect(labels).toEqual(['—', 'Detenido']);
    expect(estado).toHaveValue('draft');
  });

  it('no ofrece "Activo" en el Estado a quien no es Gerencia/PMO (el líder no puede activar el proyecto)', () => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage: 'approved', status: 'draft' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: false,
    });

    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    expect(Array.from(estado.options).map((option) => option.value)).not.toContain('active');
  });

  it('ofrece la activación manual a Gerencia/PMO', () => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage: 'approved', status: 'draft' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    expect(Array.from(estado.options).map((option) => option.textContent)).toContain('Activo (activación manual)');
  });

  it('muestra los campos de desarrollo y no los de soporte; el avance no se edita a mano', () => {
    renderDialog({ open: true, project: buildProject({ type: 'development' }), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: true });

    expect(screen.getByLabelText('Tipo de proyecto')).toBeInTheDocument();
    // El avance real se calcula desde las tareas (`projectProgressSchema`), no es un campo del formulario.
    expect(screen.queryByLabelText('Avance real (%)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Horas de soporte')).not.toBeInTheDocument();
  });

  it('muestra los campos de soporte y no los de desarrollo', () => {
    renderDialog({
      open: true,
      project: buildProject({ type: 'support', salesStage: null, phase: null }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    // En soporte "HH vendidas" edita `supportHours` (lo que muestra el listado), no `soldHours`.
    expect(screen.getAllByLabelText('HH vendidas')).toHaveLength(1);
    expect(screen.getByLabelText('HH vendidas')).toHaveValue(0);
    expect(screen.getByLabelText('Plan de soporte')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tipo de proyecto')).not.toBeInTheDocument();
  });

  it('envía los cambios al guardar', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({ commercialManager: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Rodrigo Riveros' } }),
      onClose: vi.fn(),
      onSuccess,
      isManagement: true,
    });

    const nameField = screen.getByLabelText(/Nombre del proyecto/);
    await user.clear(nameField);
    await user.type(nameField, 'Proyecto renombrado');
    // El botón "Guardar cambios" vive en el footer del `Modal` y envía el
    // formulario por el atributo `form=`, no por anidamiento — jsdom no
    // implementa esa asociación, así que se envía el formulario directamente.
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          input: expect.objectContaining({ name: 'Proyecto renombrado' }),
        }),
      ),
    );
    expect(onSuccess).toHaveBeenCalledWith('Se actualizaron los datos de Proyecto renombrado.');
  });
});
