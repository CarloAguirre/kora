import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Permission, ProjectDetail, ProjectTeamMember } from '@kora/contracts';
import { DevelopmentProjectDetailView } from './DevelopmentProjectDetailView';
import { AuthContext, type AuthContextValue } from '@/modules/auth/context/AuthContext';
import { ToastProvider } from '@/shared/components/ui/Toast';

/**
 * El pedido fue "que se vea quién es el líder de equipo y cuáles son sus
 * personas": este test cubre eso — que la ficha agrupe a cada colaborador
 * bajo SU equipo (no una tabla plana mezclando a todos) y que el líder de
 * cada equipo se muestre en el encabezado del grupo, incluso cuando ese
 * equipo no tiene una fila propia en `project_teams` (cae al líder general
 * del equipo, catálogo de equipos) — el caso real reportado: RPA sí tiene
 * líder (José Aponte) pero la ficha del proyecto no lo mostraba porque el
 * proyecto nunca fijó un líder específico para RPA.
 */

vi.mock('../api/projects.queries', () => ({
  useAssignProjectMember: () => ({ mutateAsync: vi.fn() }),
  useUnassignProjectMember: () => ({ mutateAsync: vi.fn() }),
  useResolveProjectManagementApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  useTeamMemberOptions: () => ({ data: { items: [] } }),
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
    actualProgress: null,
    supportPlanDescription: null,
    supportHours: 0,
    allowsOvertime: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    developer: null,
    commercialManager: null,
    primaryContact: null,
    estimatedDeliveryDate: null,
    expectedProgress: null,
    overtimeRateUf: 0,
    canAuthorizeOvertime: false,
    quotationLink: null,
    contractLink: null,
    additionalLinks: null,
    teams: [
      { id: 'pt-dev', teamId: 'team-dev', teamName: 'Desarrollo', leader: { id: 'u-jose', fullName: 'José Aponte' }, assignedHours: 0, memberCount: 2 },
      { id: 'pt-ux', teamId: 'team-ux', teamName: 'UX-UI', leader: { id: 'u-eduardo', fullName: 'Eduardo Aranda' }, assignedHours: 0, memberCount: 2 },
      { id: 'pt-rpa', teamId: 'team-rpa', teamName: 'RPA', leader: null, assignedHours: 0, memberCount: 3 },
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
    paymentMilestones: [],
    pendingManagementApproval: false,
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

/** Cada equipo es un `<tbody>` propio: su fila divisoria trae el nombre del equipo. */
function getTeamGroupNode(teamName: string): HTMLElement {
  const name = screen.getByText(teamName, { selector: '[class*="groupName"]' });
  return name.closest('tbody') as HTMLElement;
}

function getTeamGroup(teamName: string) {
  return within(getTeamGroupNode(teamName));
}

function getGroupLeaderText(teamName: string): string {
  const node = getTeamGroupNode(teamName).querySelector('[class*="groupLeader"]');
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('DevelopmentProjectDetailView — equipo asignado', () => {
  it('muestra el líder de cada equipo, incluso si no está fijado a nivel de proyecto', () => {
    renderView();

    expect(getGroupLeaderText('Desarrollo')).toBe('Líder: José Aponte');
    expect(getGroupLeaderText('UX-UI')).toBe('Líder: Eduardo Aranda');
    // RPA no tiene líder fijado para ESTE proyecto (project_teams.leader_user_id
    // nulo), pero el equipo sí tiene líder en general — debe mostrarse igual.
    expect(getGroupLeaderText('RPA')).toBe('Líder: José Aponte');
    // QA no tiene líder ni a nivel de proyecto ni en el catálogo de equipos.
    expect(getGroupLeaderText('QA')).toBe('Sin líder asignado');
  });

  it('agrupa a cada persona bajo su propio equipo, no en una tabla plana', () => {
    renderView();
    // Las filas de persona son <td>: eso las distingue del <b> del líder en la
    // fila divisoria, que puede repetir el mismo nombre (p. ej. José Aponte
    // lidera Desarrollo y a la vez es miembro de RPA).
    const memberRow = { selector: 'td' } as const;

    const desarrollo = getTeamGroup('Desarrollo');
    expect(desarrollo.getByText('Claudio Andres Flores Vilches', memberRow)).toBeInTheDocument();
    expect(desarrollo.getByText('Cristian Esteban Cancino Espinoza', memberRow)).toBeInTheDocument();
    expect(desarrollo.queryByText('José Aponte', memberRow)).not.toBeInTheDocument();

    const rpa = getTeamGroup('RPA');
    expect(rpa.getByText('José Aponte', memberRow)).toBeInTheDocument();
    expect(rpa.getByText('Pablo Vega', memberRow)).toBeInTheDocument();
    expect(rpa.getByText('Karen de Souza', memberRow)).toBeInTheDocument();

    const uxUi = getTeamGroup('UX-UI');
    expect(uxUi.getByText('Eduardo Aranda', memberRow)).toBeInTheDocument();
    expect(uxUi.getByText('Leslie Galaz Contreras', memberRow)).toBeInTheDocument();
  });

  it('permite quitar a una persona del equipo cuando hay permiso de gestión', () => {
    renderView(['projects:manage']);

    const desarrollo = getTeamGroup('Desarrollo');
    expect(desarrollo.getByRole('button', { name: /Quitar a Claudio Andres Flores Vilches/ })).toBeInTheDocument();
  });

  it('oculta las acciones de gestión sin el permiso correspondiente', () => {
    renderView([]);

    const desarrollo = getTeamGroup('Desarrollo');
    expect(desarrollo.queryByRole('button', { name: /Quitar a/ })).not.toBeInTheDocument();
  });

  it('el pedido fue "de qué colaborador son y el total por líder": muestra ambos', () => {
    renderView(['projects:manage'], {
      groups: [
        {
          approverUserId: 'u-jose',
          approverName: 'José Aponte',
          entryCount: 2,
          totalHours: 6,
          oldestPendingDate: '2026-01-05',
          collaborators: [
            { userId: 'user-cristian', userName: 'Cristian Esteban Cancino Espinoza', entryCount: 2, totalHours: 6, oldestPendingDate: '2026-01-05' },
          ],
        },
      ],
    });

    // Total por líder, en el encabezado del grupo que lidera.
    const desarrollo = getTeamGroup('Desarrollo');
    expect(desarrollo.getByText(/6h pendientes de aprobar \(2\)/)).toBeInTheDocument();

    // De qué colaborador son, en su propia fila.
    const cristianRow = desarrollo.getByText('Cristian Esteban Cancino Espinoza', { selector: 'td' }).closest('tr');
    expect(within(cristianRow as HTMLElement).getByText('6h (2)')).toBeInTheDocument();

    // Quien no tiene horas pendientes muestra un guion, no vacío (uno para
    // "Actividad", que tampoco tiene dato, y otro para "Pendiente aprob.").
    const claudioRow = desarrollo.getByText('Claudio Andres Flores Vilches', { selector: 'td' }).closest('tr');
    expect(within(claudioRow as HTMLElement).getAllByText('—')).toHaveLength(2);
  });
});
