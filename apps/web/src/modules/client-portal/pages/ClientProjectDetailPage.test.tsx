import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { ClientProjectDetailPage } from './ClientProjectDetailPage';
import { ToastProvider } from '@/shared/components/ui/Toast';

const { useProjectDetailMock } = vi.hoisted(() => ({ useProjectDetailMock: vi.fn() }));

vi.mock('@/modules/projects/api/projects.queries', () => ({
  useProjectDetail: useProjectDetailMock,
}));

vi.mock('@/modules/hours/api/hours.queries', () => ({
  useHourEntriesList: () => ({ data: { items: [] } }),
}));

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function buildProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'project-1',
    name: 'RutaViva',
    slug: 'rutaviva',
    client: { id: 'client-1', companyName: 'Abarca Motores' },
    type: 'development',
    salesStage: 'approved',
    status: 'active',
    phase: 'development',
    priority: 'high',
    leader: { id: 'u-jose', fullName: 'José Aponte' },
    commercialManager: { id: 'u-rocco', fullName: 'Rocco Mussuto' },
    soldHours: 500,
    usedHours: 120,
    assignedMemberCount: 0,
    plannedHours: 0,
    startDate: '2026-10-01',
    endDate: '2027-06-30',
    progress: { actual: null, expected: null, consumption: 24, delay: null, planCoverage: null, estimatedByCount: false },
    supportPlanDescription: null,
    supportHours: 0,
    allowsOvertime: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    developer: null,
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

function renderPage(project: ProjectDetail) {
  useProjectDetailMock.mockReturnValue({ data: project, isLoading: false, isError: false });
  render(
    <MemoryRouter>
      <ToastProvider>
        <ClientProjectDetailPage projectIdOverride={project.id} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ClientProjectDetailPage — última actualización', () => {
  it('muestra fecha y hora de la última acción del líder', () => {
    renderPage(buildProject({ leaderLastActivityAt: '2026-10-01T16:25:50.010Z' }));

    const expectedTime = new Date('2026-10-01T16:25:50.010Z').toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    // `textContent` y no `getByText(string)`: "p. m." trae espacios no separables que el normalizador de getByText no iguala.
    expect(screen.getByText(/Última actualización/).textContent).toBe(`Última actualización: 01-10-2026, ${expectedTime}`);
  });

  it('no muestra la línea cuando el líder no tiene actividad registrada', () => {
    renderPage(buildProject({ leaderLastActivityAt: null }));

    expect(screen.queryByText(/Última actualización/)).not.toBeInTheDocument();
  });
});
