import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  useCreateProjectModule: () => ({ mutateAsync: vi.fn() }),
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
  // Requeridos por `DailyEntryForm`/`WeeklyEntryForm`, montados siempre (aunque
  // cerrado el diálogo) por el botón "+" de `BitacoraMiniCard`.
  useProjectsList: () => ({ data: { items: [] } }),
  useProjectDetail: () => ({ data: undefined }),
}));

vi.mock('@/modules/users/api/users.queries', () => ({
  // Requerido por `DailyEntryForm`/`WeeklyEntryForm` (ver nota sobre `useProjectsList` más abajo).
  useUsersList: () => ({ data: { items: [] } }),
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
      { id: 'pt-dev', teamId: 'team-dev', teamSlug: 'desarrollo', teamName: 'Desarrollo', leader: { id: 'u-jose', fullName: 'José Aponte' }, assignedHours: 400, memberCount: 2, maxMembers: null },
      { id: 'pt-ux', teamId: 'team-ux', teamSlug: 'ux-ui', teamName: 'UX-UI', leader: { id: 'u-eduardo', fullName: 'Eduardo Aranda' }, assignedHours: 200, memberCount: 2, maxMembers: null },
      { id: 'pt-rpa', teamId: 'team-rpa', teamSlug: 'rpa', teamName: 'RPA', leader: null, assignedHours: 45, memberCount: 3, maxMembers: null },
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
    prospectPhaseHours: 0,
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

function renderView(permissions: Permission[] = ['projects:manage'], pendingApprovals: { groups: unknown[] } = { groups: [] }) {
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
          <DevelopmentProjectDetailView project={buildProject()} projectId="project-1" />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/** Cada equipo es una tarjeta-enlace propia, identificada por su nombre (texto solo para lectores de pantalla). */
function getTeamCard(teamName: string) {
  return screen.getByText(`Equipo ${teamName}`).closest('a') as HTMLAnchorElement;
}

describe('DevelopmentProjectDetailView — equipos asignados', () => {
  it('muestra el líder de cada equipo, incluso si no está fijado a nivel de proyecto', () => {
    renderView();

    expect(within(getTeamCard('Desarrollo')).getByText('José Aponte')).toBeInTheDocument();
    expect(within(getTeamCard('UX-UI')).getByText('Eduardo Aranda')).toBeInTheDocument();
    // RPA no tiene líder fijado para ESTE proyecto (project_teams.leader_user_id
    // nulo), pero el equipo sí tiene líder en general — debe mostrarse igual.
    expect(within(getTeamCard('RPA')).getByText('José Aponte')).toBeInTheDocument();
    // QA no tiene líder ni a nivel de proyecto ni en el catálogo de equipos.
    expect(within(getTeamCard('QA')).getByText('Sin líder asignado')).toBeInTheDocument();
  });

  it('resume HH asignadas/utilizadas y la salud de cada equipo', () => {
    renderView();

    const desarrollo = within(getTeamCard('Desarrollo'));
    expect(desarrollo.getByText('400 hrs')).toBeInTheDocument();
    expect(desarrollo.getByText('474 hrs')).toBeInTheDocument();
    expect(desarrollo.getByText(/Crítico — 74 hrs sobre presupuesto/)).toBeInTheDocument();

    expect(within(getTeamCard('UX-UI')).getByText(/Excelente/)).toBeInTheDocument();
    expect(within(getTeamCard('RPA')).getByText(/En rango/)).toBeInTheDocument();
    expect(within(getTeamCard('QA')).getByText(/Crítico — sin iniciar/)).toBeInTheDocument();
  });

  it('cada tarjeta lleva a la ficha del equipo dentro del proyecto', () => {
    renderView();

    expect(getTeamCard('Desarrollo')).toHaveAttribute('href', '/proyectos/proyecto-de-prueba/equipos/desarrollo');
  });

  it('no lista personas ni permite asignar o quitar gente desde la ficha', () => {
    renderView(['projects:manage']);

    expect(screen.queryByText('Claudio Andres Flores Vilches')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar a/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asignar' })).not.toBeInTheDocument();
  });
});
