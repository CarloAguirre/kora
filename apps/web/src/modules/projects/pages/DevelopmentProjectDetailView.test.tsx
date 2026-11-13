import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Permission, ProjectDetail, ProjectTeamMember } from '@kora/contracts';
import { DevelopmentProjectDetailView } from './DevelopmentProjectDetailView';
import { AuthContext, type AuthContextValue } from '@/modules/auth/context/AuthContext';
import { ToastProvider } from '@/shared/components/ui/Toast';

/**
 * "Equipos Asignados" es una grilla de tarjetas resumidas (una por equipo,
 * como en `ficha_proyecto_lider-actualizada.html`), no una tabla por persona
 * ni un formulario de asignación — eso vive en la ficha del equipo. Cada
 * tarjeta muestra al líder del equipo incluso cuando el proyecto no fijó uno
 * en `project_teams` (cae al líder general del equipo, catálogo de equipos) —
 * el caso real reportado: RPA sí tiene líder (José Aponte) pero la ficha no
 * lo mostraba porque el proyecto nunca fijó un líder específico para RPA.
 */

vi.mock('../api/projects.queries', () => ({
  useResolveProjectManagementApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCorrectProjectHito0Date: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddProjectObservation: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectObservation: () => ({ mutateAsync: vi.fn() }),
  useDeleteProjectObservation: () => ({ mutateAsync: vi.fn() }),
  useUpdateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateProjectModule: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'new-phase-id' }), isPending: false,
  }),
  useUpdateProjectModule: () => ({ mutateAsync: vi.fn() }),
  useDeleteProjectModule: () => ({ mutateAsync: vi.fn() }),
  useAddProjectModuleDelivery: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectModuleDelivery: () => ({ mutateAsync: vi.fn() }),
  useRemoveProjectModuleDelivery: () => ({ mutateAsync: vi.fn() }),
  useCreateProjectModuleSegment: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectModuleSegment: () => ({ mutateAsync: vi.fn() }),
  useDeleteProjectModuleSegment: () => ({ mutateAsync: vi.fn() }),
  useCreateProjectModuleTask: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectModuleTask: () => ({ mutateAsync: vi.fn() }),
  useDeleteProjectModuleTask: () => ({ mutateAsync: vi.fn() }),
  useRoadmapReferenceExclusions: () => ({ data: [] }),
  useExcludeRoadmapReference: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Requeridos por `DailyEntryForm`/`WeeklyEntryForm`, montados siempre (aunque
  // cerrado el diálogo) por el botón "+" de `BitacoraMiniCard`.
  useProjectsList: () => ({ data: { items: [] } }),
  useProjectDetail: () => ({ data: undefined }),
}));

vi.mock('@/modules/users/api/users.queries', () => ({
  // Requerido por `DailyEntryForm`/`WeeklyEntryForm` (ver nota sobre `useProjectsList` más abajo).
  useUsersList: () => ({ data: { items: [] } }),
}));

// Estas pruebas verifican la ficha y los equipos, no el endpoint comercial.
 // Aislar el nuevo widget evita requerir QueryClientProvider y peticiones de red
 // en un test que ya sustituye los demás hooks de datos por mocks.
vi.mock('@/modules/estimation/api/quotation.queries', () => ({
  useDeleteQuotationVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQuotationLifecycle: () => ({
    approveClient: { mutateAsync: vi.fn(), isPending: false },
    transferApproved: { mutateAsync: vi.fn(), isPending: false },
  }),
  useAppliedQuotationPlanning: () => ({ data: null, isLoading: false, isError: false }),
  useProjectQuotation: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/modules/forecast/api/forecast.queries', () => ({
  useForecastLoadPreview: () => ({ data: undefined }),
  useCheckForecastOverload: () => async () => [],
}));

vi.mock('@/modules/teams/api/teams.queries', () => ({
  useTeamsList: () => ({
    data: {
      items: [
        { id: 'team-dev', name: 'Desarrollo', leader: { id: 'u-jose', fullName: 'José Aponte' } },
        { id: 'team-ux', name: 'UX-UI', leader: { id: 'u-eduardo', fullName: 'Eduardo Aranda' } },
        { id: 'team-rpa', name: 'RPA', leader: { id: 'u-jose', fullName: 'José Aponte' } },
        { id: 'team-qa', name: 'QA', leader: null },
      ],
    },
  }),
}));

const { useProjectPendingApprovalsMock } = vi.hoisted(() => ({ useProjectPendingApprovalsMock: vi.fn() }));

vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHourEntriesList: () => ({ data: { items: [] } }),
  useProjectPendingApprovals: useProjectPendingApprovalsMock,
  // `BitacoraMiniCard` monta `HourEntryFormDialog` (siempre en el DOM, aunque
  // cerrado — ver `Modal`) para el botón "+", que a su vez usa estos hooks.
  useCreateHourEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHolidays: () => ({ data: [] }),
}));

function buildMember(overrides: Partial<ProjectTeamMember>): ProjectTeamMember {
  return {
    id: 'member-id',
    teamId: 'team-id',
    teamName: 'Equipo',
    teamMemberId: 'team-member-id',
    userId: 'user-id',
    fullName: 'Persona',
    userStatus: 'active',
    activity: null,
    assignedHours: 0,
    consumedHours: 0,
    ...overrides,
  };
}

function buildProject(): ProjectDetail {
  return {
    id: 'project-1',
    name: 'Proyecto de prueba',
    slug: 'proyecto-de-prueba',
    client: { id: 'client-1', companyName: 'Cliente SA' },
    type: 'development',
    salesStage: 'approved',
    status: 'active',
    phase: 'development',
    priority: 'high',
    leader: { id: 'u-claudio', fullName: 'Claudio Flores' },
    soldHours: 500,
    usedHours: 629,
    assignedMemberCount: 7,
    plannedHours: 0,
    startDate: '2026-01-01',
    endDate: null,
    progress: { actual: null, expected: null, consumption: 126, delay: null, planCoverage: null, estimatedByCount: false },
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
    teams: [
      { id: 'pt-dev', teamId: 'team-dev', teamSlug: 'desarrollo', teamName: 'Desarrollo', leader: { id: 'u-jose', fullName: 'José Aponte' }, assignedHours: 400, memberCount: 2, maxMembers: null, leaderConsumedHours: 0, isTeamLeader: false },
      { id: 'pt-ux', teamId: 'team-ux', teamSlug: 'ux-ui', teamName: 'UX-UI', leader: { id: 'u-eduardo', fullName: 'Eduardo Aranda' }, assignedHours: 200, memberCount: 2, maxMembers: null, leaderConsumedHours: 0, isTeamLeader: false },
      { id: 'pt-rpa', teamId: 'team-rpa', teamSlug: 'rpa', teamName: 'RPA', leader: null, assignedHours: 45, memberCount: 3, maxMembers: null, leaderConsumedHours: 0, isTeamLeader: false }
    ],
    members: [
      buildMember({ id: 'm1', userId: 'user-jose', teamId: 'team-rpa', teamName: 'RPA', fullName: 'José Aponte', consumedHours: 16 }),
      buildMember({
        id: 'm2',
        userId: 'user-claudio',
        teamId: 'team-dev',
        teamName: 'Desarrollo',
        fullName: 'Claudio Andres Flores Vilches',
        consumedHours: 144,
      }),
      buildMember({ id: 'm3', userId: 'user-eduardo', teamId: 'team-ux', teamName: 'UX-UI', fullName: 'Eduardo Aranda', consumedHours: 66.75 }),
      buildMember({ id: 'm4', userId: 'user-pablo', teamId: 'team-rpa', teamName: 'RPA', fullName: 'Pablo Vega', consumedHours: 2 }),
      buildMember({ id: 'm5', userId: 'user-karen', teamId: 'team-rpa', teamName: 'RPA', fullName: 'Karen de Souza', consumedHours: 22.25 }),
      buildMember({
        id: 'm6',
        userId: 'user-cristian',
        teamId: 'team-dev',
        teamName: 'Desarrollo',
        fullName: 'Cristian Esteban Cancino Espinoza',
        consumedHours: 330,
      }),
      buildMember({ id: 'm7', userId: 'user-leslie', teamId: 'team-ux', teamName: 'UX-UI', fullName: 'Leslie Galaz Contreras', consumedHours: 48 }),
      buildMember({ id: 'm8', userId: 'user-qa', teamId: 'team-qa', teamName: 'QA', fullName: 'Nueva Persona', consumedHours: 0 }),
    ],
    observations: [],
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
    modules: [],
    legacyId: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderView(
  permissions: Permission[] = ['projects:manage'],
  pendingApprovals: { groups: unknown[] } = { groups: [] },
  projectOverride: ProjectDetail = buildProject(),
) {
  useProjectPendingApprovalsMock.mockReturnValue({ data: pendingApprovals });
  const auth: AuthContextValue = {
    user: {
      id: 'actor',
      email: 'claudio.flores@kabeli.cl',
      firstName: 'Claudio',
      lastName: 'Flores',
      fullName: 'Claudio Flores',
      role: 'admin',
      status: 'active',
      permissions,
      teamId: null,
      leaderProfile: null,
      mustChangePassword: false,
    },
    status: 'authenticated',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <DevelopmentProjectDetailView project={projectOverride} projectId="project-1" />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/** Cada equipo es una tarjeta-enlace propia, identificada por su nombre (texto solo para lectores de pantalla). */
function getTeamCard(teamName: string) {
  return screen.getByText(`Equipo ${teamName}`).closest('a') as HTMLAnchorElement;
}

describe('Cotizaciones integradas en ficha Kora', () => {
  it('muestra el nuevo tab dentro de las pestañas y no la tarjeta exterior anterior', () => {
    renderView();
    const button = screen.getByRole('button', { name: 'Cotizaciones' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cotizaciones del proyecto' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('region', { name: 'Cotizaciones del proyecto' })).toBeInTheDocument();
    expect(screen.getByText('Este proyecto aún no tiene cotización')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Nueva cotización' })).toBeEnabled();
  });
});

describe('Navegación guiada desde el Roadmap a Resumen', () => {
  it('habilita el Roadmap con estado Prospecto / No iniciado aun sin una fase', () => {
    const initial = buildProject();
    renderView(['projects:manage'], { groups: [] }, {
      ...initial, salesStage: 'prospect', status: 'draft', modules: [], teams: [], members: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }));
    expect(screen.getByRole('heading', { name: 'Arma el plan del proyecto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear la primera fase' })).toBeEnabled();
    expect(screen.queryByText(/El Roadmap está disponible para proyectos aprobados/))
      .not.toBeInTheDocument();
  });

  it('conserva el Roadmap visible en Prospecto / No iniciado después de que existe una fase', () => {
    const initial = buildProject();
    const projectWithPhase = { ...initial, salesStage: 'prospect', status: 'draft',
      modules: [{
        id: 'fase-1', name: 'Planificación inicial', initialStage: 'discovery',
        currentStage: 'discovery', progress: {
          actual: null, expected: null, scopes: {}, estimatedByCount: false,
        }, blockerCount: 0, segments: [], deliveries: [], tasks: [],
        estimatedHours: null, estimatedStartDate: null, estimatedEndDate: null,
      }],
    } as unknown as ProjectDetail;
    renderView(['projects:manage'], { groups: [] }, projectWithPhase);
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }));
    expect(screen.queryByText(/El Roadmap está disponible para proyectos aprobados/))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Arma el plan del proyecto' }))
      .not.toBeInTheDocument();
    expect(screen.getByText('Planificación inicial')).toBeInTheDocument();
  });

  it('permite iniciar planificación de un proyecto operativo aunque su etapa comercial no sea approved', () => {
    const initial = buildProject();
    renderView(['projects:manage'], { groups: [] }, {
      ...initial, salesStage: 'quoted', status: 'active', modules: [],
    } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }));
    expect(screen.getByRole('heading', { name: 'Arma el plan del proyecto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear la primera fase' })).toBeEnabled();
  });

  it('tras crear una fase sin equipos abre la sección real de Equipos asignados en modo gestión', async () => {
    const initial = buildProject();
    renderView(['projects:manage'], { groups: [] }, {
      ...initial, modules: [], teams: [], members: [],
    } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Roadmap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear la primera fase' }));
    const createModal = screen.getByRole('dialog', { name: 'Nueva fase' });
    fireEvent.change(within(createModal).getByRole('textbox', { name: 'Nombre de la fase' }), {
      target: { value: 'Fase de integración' },
    });
    fireEvent.click(within(createModal).getByRole('button', { name: 'Crear fase' }));
    const missingTeams = await screen.findByRole('dialog', { name: 'Primero agrega equipos' });
    fireEvent.click(within(missingTeams).getByRole('button', { name: 'Ir a Equipos asignados' }));
    expect(screen.getByRole('button', { name: 'Resumen' }).className)
      .toContain('tabsShellButtonActive');
    const teams = document.getElementById('project-assigned-teams');
    expect(teams).not.toBeNull();
    expect(within(teams!).getByText('Agregar equipo')).toBeInTheDocument();
    expect(within(teams!).getByRole('combobox', { name: 'Agregar equipo' })).toBeInTheDocument();
    expect(within(teams!).getByRole('button', { name: 'Listo' })).toBeInTheDocument();
  });
});

describe('Avance del proyecto — misma fuente operativa que el Roadmap', () => {
  it('no toma el 100% antiguo del backend si las tareas del bloque aún no están aprobadas', () => {
    const old = buildProject();
    const viewProject = {
      ...old,
      // project.progress usa otra fórmula (por fases/ítems), por eso no puede
      // determinar el porcentaje que aquí muestra el Roadmap por segmentos.
      progress: { ...old.progress, actual: 100, expected: 100 },
      modules: [{
        id: 'phase-operativa', name: 'Diseño UX',
        estimatedHours: 100,
        segments: [{
          id: 'block-operativo', teamId: 'team-dev', teamName: 'Desarrollo',
          name: 'Diseño UX', startDate: '2026-01-01', endDate: '2026-02-01',
          estimatedHours: 100, consumedHours: 12, members: [],
        }],
        deliveries: [],
        tasks: [{
          id: 'task-pending', teamId: 'team-dev', segmentId: 'block-operativo',
          assigneeUserId: null, cancelledAt: null, estimatedHours: 100,
          status: 'todo', date: '2026-01-30', description: null,
        }],
      }],
    } as unknown as ProjectDetail;
    renderView(['projects:manage'], { groups: [] }, viewProject);
    expect(screen.getByRole('heading', { name: 'Avance del proyecto' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Avance real 0%; plan a la fecha 100%' }))
      .toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Cómo se calcula este avance/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Fase 1: Diseño UX')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Fase 1: Diseño UX')).toBeInTheDocument();
    // El plan operativo puede diferir del contrato sin que sea un error
    // automático. Se informa la diferencia, sin alertar por falsa incoherencia.
    expect(screen.getByText(/La diferencia no cambia el contrato/)).toBeInTheDocument();
    expect(screen.queryByText(/Las HH de bloques no coinciden con la estimación comercial/))
      .not.toBeInTheDocument();
  });
});

describe('DevelopmentProjectDetailView — equipos PM/PMO', () => {
  it('muestra el líder de los equipos, incluyendo el fallback del catálogo', () => {
    renderView();
    expect(within(getTeamCard('Desarrollo')).getByText('José Aponte')).toBeInTheDocument();
    expect(within(getTeamCard('UX-UI')).getByText('Eduardo Aranda')).toBeInTheDocument();
    expect(within(getTeamCard('RPA')).getByText('José Aponte')).toBeInTheDocument();
  });

  it('muestra las HH reales y la planificación en el resumen de equipos', () => {
    renderView();
    expect(screen.getAllByText('HH vendidas').length).toBeGreaterThan(1);
    expect(screen.getByText('Asignadas a equipos')).toBeInTheDocument();
    expect(screen.getByText('Por asignar')).toBeInTheDocument();
    expect(screen.getByText('Planificadas en bloques')).toBeInTheDocument();
    const desarrollo = within(getTeamCard('Desarrollo'));
    expect(desarrollo.getByText('400 hrs')).toBeInTheDocument();
    expect(desarrollo.getByText('474 hrs')).toBeInTheDocument();
    expect(desarrollo.getByText(/Sobre presupuesto/)).toBeInTheDocument();
  });

  it('cada card conserva el enlace profundo al equipo dentro del proyecto', () => {
    renderView();
    expect(getTeamCard('Desarrollo')).toHaveAttribute('href', '/proyectos/proyecto-de-prueba/equipos/desarrollo');
  });

  it('el PM gestiona líder, cupos y HH en la misma sección, no la asignación de personas', () => {
    renderView(['projects:manage']);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar equipos' }));
    expect(screen.getByRole('button', { name: 'Listo' })).toBeInTheDocument();
    expect(screen.getByText('Agregar equipo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar equipo Desarrollo' })).toBeInTheDocument();
    expect(screen.queryByText('Claudio Andres Flores Vilches')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asignar' })).not.toBeInTheDocument();
  });
});
