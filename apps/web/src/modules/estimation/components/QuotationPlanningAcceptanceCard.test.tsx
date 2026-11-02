import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { quotationVersionSchema } from '@kora/contracts';
import { QuotationPlanningAcceptanceCard } from './QuotationPlanningAcceptanceCard';

const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const versionId = '0777e456-fd76-445e-83f1-afc25061c102';
const teamId = '0777e456-fd76-445e-83f1-afc25061c103';
const mocks = vi.hoisted(() => ({
  applied: null as null | { versionId: string },
  mutate: vi.fn(),
}));
vi.mock('../api/quotation.queries', () => ({
  useAppliedQuotationPlanning: () => ({
    data: mocks.applied, isLoading: false, isError: false,
  }),
  useApplyQuotationPlanning: () => ({
    mutateAsync: mocks.mutate, isPending: false,
  }),
}));
const version = quotationVersionSchema.parse({
  id: versionId,
  quotationId: '0777e456-fd76-445e-83f1-afc25061c104',
  versionNumber: 1, revision: 2,
  name: 'Propuesta demo', status: 'draft', origin: 'ai',
  aiReviewStatus: 'pending', createdByUserId: '0777e456-fd76-445e-83f1-afc25061c105',
  hourlyRate: null, currency: 'UF', tax: 'iva19',
  totalHours: 40, netAmount: null, totalAmount: null,
  createdAt: '2026-11-02T13:00:00.000Z',
  updatedAt: '2026-11-02T13:00:00.000Z',
  draft: {
    mode: 'phases',
    teams: [{ teamId, collaborators: 1, unit: 'week', duration: 1,
      hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [{ name: 'Desarrollo', startWeek: 1, durationWeeks: 1,
      teamHours: [{ teamId, hours: 40 }] }],
    sourceRefs: ['demo:kdm_fixture'], answers: { F01: 'mvp' },
    analysisProjectionStatus: 'synced',
    aiPoc: {
      source: 'kdm_demo',
      answers: [{ questionId: 'F01', value: 'mvp', usedAssumption: false }],
      dynamicQuestions: [],
      roleTeamIds: { Desarrollo: teamId },
      proposal: {
        projectId, provider: 'gemini', sourceMode: 'poc_simulated',
        documentsAnalyzed: 1, summary: 'Portal KDM de ejemplo',
        roles: [{ role: 'Desarrollo', unit: 'week', duration: 1,
          hoursPerUnit: 40, people: 1, totalHours: 40 }],
        totalHours: 40, assumptions: [], clarifyingQuestions: [],
      },
      edt: {
        schemaVersion: 'kora.quotation.reference-edt.v1',
        source: 'kdm_demo', provider: 'gemini', totalHours: 40,
        modules: [{
          name: 'Portal', totalHours: 40,
          tasks: [{ wbs: '1.1', name: 'Backend',
            description: 'Servicio API', role: 'Desarrollo', hours: 40 }],
        }],
      },
    },
  },
});
afterEach(() => {
  vi.restoreAllMocks();
  mocks.applied = null;
  mocks.mutate.mockReset();
});

describe('Aceptación de planificación KDM', () => {
  it('muestra tareas de referencia sin fechas y exige confirmación de Gerencia', async () => {
    mocks.mutate.mockResolvedValue({
      versionId, totalHours: 40,
      modules: [{ name: 'Portal', tasks: [], totalHours: 40 }],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<QuotationPlanningAcceptanceCard projectId={projectId}
      version={version} canManage hasUnsavedChanges={false} />);
    expect(screen.getByText(/EDT de referencia/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Portal · 1 tareas · 40 HH/));
    expect(screen.getByText(/1.1 · Backend/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar estimación y crear planificación' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith({
      versionId,
      input: { revision: 2, confirmation: 'APLICAR_PLANIFICACION_KDM_DEMO' },
    });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('KDM DE PRUEBA'));
    expect(screen.getByText(/Sin fechas ni responsables/)).toBeInTheDocument();
  });

  it('bloquea doble aplicación, cambios locales y actores sin autorización', () => {
    const first = render(<QuotationPlanningAcceptanceCard projectId={projectId}
      version={version} canManage hasUnsavedChanges />);
    expect(screen.getByRole('button', { name: 'Aceptar estimación y crear planificación' }))
      .toBeDisabled();
    first.unmount();
    mocks.applied = { versionId };
    const second = render(<QuotationPlanningAcceptanceCard projectId={projectId}
      version={version} canManage hasUnsavedChanges={false} />);
    expect(screen.getByText(/ya se aplicó al Roadmap/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar estimación y crear planificación' }))
      .not.toBeInTheDocument();
    second.unmount();
    mocks.applied = null;
    render(<QuotationPlanningAcceptanceCard projectId={projectId}
      version={version} canManage={false} hasUnsavedChanges={false} />);
    expect(screen.queryByRole('button', { name: 'Aceptar estimación y crear planificación' }))
      .not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
