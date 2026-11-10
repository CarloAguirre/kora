import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SUPPORT_SURPLUS_POLICY_LABELS, type ProjectDetail } from '@kora/contracts';
import { EditProjectDialog, type EditProjectDialogProps } from './EditProjectDialog';
import { EditDevelopmentProjectDialog, type EditDevelopmentProjectDialogProps } from './EditDevelopmentProjectDialog';
import { ToastProvider } from '@/shared/components/ui/Toast';

function renderDialog(props: EditProjectDialogProps) {
  return render(
    <ToastProvider>
      <EditProjectDialog {...props} />
    </ToastProvider>,
  );
}

function renderDevelopmentDialog(props: EditDevelopmentProjectDialogProps) {
  return render(
    <ToastProvider>
      <EditDevelopmentProjectDialog {...props} />
    </ToastProvider>,
  );
}

const projectQuotationMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/estimation/api/quotation.queries', () => ({
  useProjectQuotation: (...args: unknown[]) => projectQuotationMock(...args),
}));

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

const updateSupportPlanMutateAsync = vi.fn().mockResolvedValue(undefined);
const supportPlansForClientMock = vi.fn(() => ({ data: [] as unknown[] }));
const supportPlanDetailMock = vi.fn(() => ({ data: undefined as unknown }));

vi.mock('../api/support-plan.queries', () => ({
  useSupportPlansForClient: () => supportPlansForClientMock(),
  useSupportPlanDetail: () => supportPlanDetailMock(),
  useUpdateSupportPlan: () => ({ mutateAsync: updateSupportPlanMutateAsync }),
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
    isInternal: false,
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
    mutateAsync.mockClear();
  });

  it('precarga el formulario con los datos actuales del proyecto', () => {
    renderDialog({ open: true, project: buildProject(), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: true });

    expect(screen.getByRole('dialog', { name: 'Editar proyecto' })).toHaveClass('bodyScrollOnly');
    expect(screen.getByLabelText(/Nombre del proyecto/)).toHaveValue('Proyecto de prueba');
    expect(screen.getByLabelText('HH vendidas')).toHaveValue(500);
  });

  it('permite editar HH vendidas después de Hito 0 y pide motivo al cambiarlas', async () => {
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({
        hito0At: '2026-10-01T00:00:00.000Z',
        commercialManager: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Rodrigo Viveros' },
      }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    const soldHours = screen.getByLabelText('HH vendidas');
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(soldHours).toBeEnabled();
    expect(save).toBeEnabled();
    expect(screen.queryByLabelText('Motivo del ajuste de HH vendidas')).not.toBeInTheDocument();

    await user.clear(soldHours);
    await user.type(soldHours, '750');
    const reason = screen.getByLabelText('Motivo del ajuste de HH vendidas');
    expect(save).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Debes ingresar un motivo del ajuste de HH vendidas para habilitar «Guardar cambios».',
    );
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(mutateAsync).not.toHaveBeenCalled();

    // Solo espacios no satisfacen la obligación de dejar un motivo.
    await user.type(reason, '   ');
    expect(save).toBeDisabled();

    await user.type(reason, 'Ampliación de alcance aprobada');
    expect(save).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(reason).toHaveAttribute('aria-invalid', 'false');
    // jsdom no envía formularios desde botones externos por el atributo form.
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'project-1',
        input: expect.objectContaining({ soldHours: 750, soldHoursChangeReason: 'Ampliación de alcance aprobada' }),
      })),
    );
  });

  it('no exige motivo si las HH vendidas permanecen iguales después de Hito 0', () => {
    renderDialog({
      open: true,
      project: buildProject({ hito0At: '2026-10-01T00:00:00.000Z' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });
    expect(screen.getByLabelText('HH vendidas')).toBeEnabled();
    expect(screen.queryByLabelText('Motivo del ajuste de HH vendidas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('reactiva Guardar si las HH vendidas vuelven a su valor anterior', async () => {
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({ hito0At: '2026-10-01T00:00:00.000Z' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });
    const soldHours = screen.getByLabelText('HH vendidas');
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    await user.clear(soldHours);
    await user.type(soldHours, '750');
    expect(save).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.clear(soldHours);
    await user.type(soldHours, '500');
    expect(save).toBeEnabled();
    expect(screen.queryByLabelText('Motivo del ajuste de HH vendidas')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  it.each(['prospect', 'quoted'] as const)('en %s el Estado queda fijo en "No iniciado" y bloqueado', (salesStage) => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage, status: 'draft', phase: null }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    const labels = Array.from(estado.options).map((option) => option.textContent);
    expect(labels).toEqual(['No iniciado']);
    expect(estado).toHaveValue('draft');
    expect(estado).toBeDisabled();
  });

  it('ofrece la activación manual también al líder del proyecto (sin Gerencia/PMO)', () => {
    renderDialog({
      open: true,
      project: buildProject({ salesStage: 'approved', status: 'draft' }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: false,
    });

    const estado = screen.getByLabelText('Estado') as HTMLSelectElement;
    expect(Array.from(estado.options).map((option) => option.textContent)).toContain('Activo (activación manual)');
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

    // Las horas del plan (mensuales / bolsa) se editan en el contrato de soporte, no aquí.
    expect(screen.queryByLabelText('Horas de soporte')).not.toBeInTheDocument();
    // Las HH vendidas son `soldHours` también en soporte (fijas; lo que avanza son las consumidas).
    expect(screen.getByLabelText('HH vendidas')).toHaveValue(500);
    // El tipo de soporte sale del contrato (`plan_type`); ya no es un texto libre editable aquí.
    expect(screen.queryByLabelText('Plan de soporte')).not.toBeInTheDocument();
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

  it('al marcar "Proyecto interno" oculta el plan de pago y manda el flag al guardar', async () => {
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({ commercialManager: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Rodrigo Riveros' } }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    expect(screen.getByRole('heading', { name: 'Plan de pago' })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Proyecto interno'));
    expect(screen.queryByRole('heading', { name: 'Plan de pago' })).not.toBeInTheDocument();

    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-1', input: expect.objectContaining({ isInternal: true }) }),
      ),
    );
  });

  it('solo Gerencia/PMO puede cambiar "Proyecto interno"', () => {
    renderDialog({ open: true, project: buildProject(), onClose: vi.fn(), onSuccess: vi.fn(), isManagement: false });

    expect(screen.getByLabelText('Proyecto interno')).toBeDisabled();
    expect(screen.getByText('Solo Gerencia/PMO puede marcar o desmarcar un proyecto como interno.')).toBeInTheDocument();
  });

  it('muestra el tipo de soporte del contrato vigente y guarda el cambio en el contrato', async () => {
    supportPlansForClientMock.mockReturnValue({
      data: [
        // Un contrato terminado del mismo proyecto no debe ser el que se edita.
        { id: 'plan-0', projectId: 'project-1', status: 'ended', planType: 'bundle', surplusPolicy: null, contractedHours: 0 },
        { id: 'plan-1', projectId: 'project-1', status: 'active', planType: 'monthly', surplusPolicy: 'accumulate', contractedHours: 10 },
      ],
    });
    supportPlanDetailMock.mockReturnValue({ data: activeMonthlyPlanDetail });
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({ type: 'support', salesStage: null, phase: null }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    expect(screen.getByRole('radio', { name: 'Mensual' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: SUPPORT_SURPLUS_POLICY_LABELS.accumulate })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Cantidad de HH mensuales')).toHaveValue(10);
    // Las HH del contenedor son las del plan: no hay un segundo campo "HH vendidas" que pueda contradecirlas.
    expect(screen.queryByLabelText('HH vendidas')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Bolsa' }));
    // La política de excedente es solo de los planes mensuales.
    expect(screen.queryByRole('radiogroup', { name: 'Política de excedente' })).not.toBeInTheDocument();
    const bundleHours = screen.getByLabelText('Cantidad de HH de la bolsa');
    await user.clear(bundleHours);
    await user.type(bundleHours, '40');
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);

    await waitFor(() =>
      expect(updateSupportPlanMutateAsync).toHaveBeenCalledWith({
        planType: 'bundle',
        surplusPolicy: null,
        contractedHours: 40,
        planValueUf: 0.6,
        extraHourValueUf: 1.1,
        currency: 'UF',
      }),
    );
    const projectInput = mutateAsync.mock.calls.at(-1)?.[0].input;
    expect(projectInput.soldHours).toBeUndefined();
    expect(projectInput.supportHours).toBeUndefined();
    supportPlansForClientMock.mockReturnValue({ data: [] });
    supportPlanDetailMock.mockReturnValue({ data: undefined });
  });

  it('edita el valor de la hora del contrato y muestra la cuota que se facturará', async () => {
    supportPlansForClientMock.mockReturnValue({
      data: [{ id: 'plan-1', projectId: 'project-1', status: 'active', planType: 'monthly', surplusPolicy: 'accumulate', contractedHours: 10 }],
    });
    supportPlanDetailMock.mockReturnValue({ data: activeMonthlyPlanDetail });
    const user = userEvent.setup();
    renderDialog({
      open: true,
      project: buildProject({ type: 'support', salesStage: null, phase: null }),
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      isManagement: true,
    });

    const hourValue = screen.getByLabelText('Valor de la hora');
    expect(hourValue).toHaveValue(0.6);
    expect(screen.getByLabelText('Valor de horas extra')).toHaveValue(1.1);
    await user.clear(hourValue);
    await user.type(hourValue, '1.5');
    expect(screen.getByText(/Cuota mensual: 10 HH ×/)).toBeInTheDocument();
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);

    await waitFor(() =>
      expect(updateSupportPlanMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ planValueUf: 1.5, extraHourValueUf: 1.1, currency: 'UF' })),
    );
    supportPlansForClientMock.mockReturnValue({ data: [] });
    supportPlanDetailMock.mockReturnValue({ data: undefined });
  });
});

/** Solo los campos del detalle que lee el diálogo. */
const activeMonthlyPlanDetail = {
  id: 'plan-1',
  planType: 'monthly',
  surplusPolicy: 'accumulate',
  contractedHours: 10,
  planValueUf: 0.6,
  extraHourValueUf: 1.1,
  currency: 'UF',
  linkedProjects: [],
  summary: { currentPeriod: null },
};


describe('Editar proyecto de desarrollo · contenido acotado a la referencia v5.02', () => {
  beforeEach(() => {
    useUsersListMock.mockReturnValue({ data: { items: [] } });
    projectQuotationMock.mockReset().mockReturnValue({ data: null });
    mutateAsync.mockReset().mockResolvedValue(undefined);
    changeStatusMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  const props = (overrides: Partial<ProjectDetail> = {}, onViewQuotations = vi.fn()) => ({
    open: true,
    project: buildProject({ commercialManager: {
      id: '22222222-2222-4222-8222-222222222222', fullName: 'Rodrigo Viveros',
    }, ...overrides }),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    onViewQuotations,
    isManagement: true,
  });

  it('muestra exclusivamente los bloques de la imagen y ningún editor de equipos/fases', () => {
    renderDevelopmentDialog(props({ canAuthorizeOvertime: true }));
    expect(screen.getByRole('dialog', { name: 'Editar proyecto' })).toHaveClass('projectEditSide');
    expect(screen.getByRole('dialog', { name: 'Editar proyecto' })).toHaveClass('bodyScrollOnly');
    for (const name of [
      'Nombre del proyecto', 'Cliente', 'Líder Kabeli a cargo', 'Responsable comercial',
      'Tipo de proyecto', 'Estado', 'Etapa de avance', 'Proyecto interno',
      'Fecha de inicio', 'Fecha de fin', 'HH vendidas', 'Autorizar horas extra',
      'Cotización', 'Contrato',
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${name}`))).toBeInTheDocument();
    }
    for (const section of ['Fechas y horas', 'Plan de pago', 'Documentación']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
    }
    expect(screen.getByText(/se gestionan en la ficha/)).toBeInTheDocument();
    expect(screen.getByText('Equipos asignados')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    for (const removed of [
      'Equipos e involucrados', 'Fases · Módulos', 'Contrato de soporte',
      'Tiempos de respuesta (SLA)', 'Agregar fase / módulo',
      'Notas de alcance', 'Horas totales (equipos)',
      'Documentación de entrega',
    ]) {
      expect(screen.queryByText(removed)).not.toBeInTheDocument();
    }
  });

  it('muestra el estado real de la cotización y abre su pestaña desde el aviso', async () => {
    const onView = vi.fn();
    renderDevelopmentDialog(props({ quotationStatus: 'approved_pending' }, onView));
    expect(screen.getByText('Cotización · Aprobada · traspaso pendiente')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver cotizaciones' }));
    expect(onView).toHaveBeenCalledOnce();
  });

  it('presenta versión y fecha verificadas del evento de traspaso, con enlace al tab Cotizaciones', async () => {
    const openQuotations = vi.fn();
    projectQuotationMock.mockReturnValue({
      data: {
        transferredVersionId: 'version-1',
        transferredAt: '2026-09-02T15:00:00.000Z',
        versions: [{ id: 'version-1', versionNumber: 1, status: 'approved' }],
      },
    });
    renderDevelopmentDialog(props({ quotationStatus: 'transferred' }, openQuotations));
    expect(screen.getByText('Cotización · v1 traspasada el 02 sept 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver cotizaciones' }));
    expect(openQuotations).toHaveBeenCalledOnce();
    expect(projectQuotationMock).toHaveBeenCalledWith('project-1', true);
  });

  it('evita inventar la fecha si no hay evento de traspaso', () => {
    projectQuotationMock.mockReturnValue({
      data: {
        transferredVersionId: 'version-1',
        transferredAt: null,
        versions: [{ id: 'version-1', versionNumber: 1, status: 'approved' }],
      },
    });
    renderDevelopmentDialog(props({ quotationStatus: 'planning_applied' }));
    expect(screen.getByText('Cotización · v1 traspasada')).toBeInTheDocument();
    expect(screen.queryByText(/traspasada el/)).not.toBeInTheDocument();
  });

  it('guarda solo datos generales y no envía relaciones de equipos ni módulos', async () => {
    const p = props({
      teams: [{
        teamId: '33333333-3333-4333-8333-333333333333',
        teamName: 'UX-UI',
        assignedHours: 120,
        leader: null,
      }] as ProjectDetail['teams'],
    });
    renderDevelopmentDialog(p);
    await userEvent.clear(screen.getByLabelText(/^Nombre del proyecto/));
    await userEvent.type(screen.getByLabelText(/^Nombre del proyecto/), 'Portal actualizado');
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const input = mutateAsync.mock.calls.at(-1)?.[0].input;
    expect(input.name).toBe('Portal actualizado');
    expect(input).not.toHaveProperty('teams');
    expect(input).not.toHaveProperty('modules');
    expect(input).not.toHaveProperty('deliveries');
    expect(input).not.toHaveProperty('paymentMilestones');
    expect(p.onSuccess).toHaveBeenCalledWith('Se actualizaron los datos de Portal actualizado.');
  });

  it('conserva el motivo obligatorio al cambiar HH después del Hito 0', async () => {
    renderDevelopmentDialog(props({ hito0At: '2026-10-01T00:00:00.000Z' }));
    const sold = screen.getByLabelText('HH vendidas');
    fireEvent.change(sold, { target: { value: '650' } });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo del ajuste de HH vendidas'), {
      target: { value: 'Alcance ampliado y aprobado' },
    });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        soldHours: 650, soldHoursChangeReason: 'Alcance ampliado y aprobado',
      }),
    })));
  });

  it('con proyecto interno oculta el plan de pago sin borrar su contrato guardado', async () => {
    renderDevelopmentDialog(props());
    fireEvent.click(screen.getByLabelText('Proyecto interno'));
    expect(screen.queryByRole('heading', { name: 'Plan de pago' })).not.toBeInTheDocument();
    fireEvent.submit(document.getElementById('edit-project-form') as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ isInternal: true }),
    })));
    const input = mutateAsync.mock.calls.at(-1)?.[0].input;
    expect(input).not.toHaveProperty('paymentMilestones');
  });
});
