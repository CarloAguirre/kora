import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
describe('EDT de cotización sin aplicación prematura', () => {
  it('muestra WBS y HH de Gemini sin habilitar traspaso hasta aprobación comercial', () => {
    render(<QuotationPlanningAcceptanceCard version={version} />);
    expect(screen.getByText(/EDT de referencia/)).toBeInTheDocument();
    expect(screen.getByText('Portal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Portal'));
    expect(screen.getByText('1.1')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    const task = screen.getByText('Backend').closest('details');
    expect(task).not.toBeNull();
    fireEvent.click(screen.getByText('Backend'));
    expect(task).toHaveAttribute('open');
    expect(screen.getByText('Servicio API')).toBeInTheDocument();
    expect(screen.getByText('Desarrollo: 40 HH')).toBeInTheDocument();
    expect(screen.getByText(/El traspaso requiere aprobación del cliente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceptar estimación y crear planificación/ }))
      .not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('presenta el desglose EDT v2 por tramo, perfil, equipo y reserva sin sumar dos veces', () => {
    const extended = structuredClone(version);
    const ai = extended.draft.aiPoc!;
    ai.roleTeamIds = { Desarrollo: teamId, QA: '0777e456-fd76-445e-83f1-afc25061c106' };
    ai.edt = {
      schemaVersion: 'kora.quotation.reference-edt.v2',
      source: 'kdm_demo', provider: 'gemini',
      totalHours: 40, reservePercent: 10, reserveHours: 4, totalWithReserve: 44,
      stages: [{ code: 'T01', name: 'Construcción', startWeek: 1, durationWeeks: 2, totalHours: 40 }],
      modules: [{
        name: 'Portal', totalHours: 40,
        tasks: [{ wbs: 'T01.01', name: 'API y pruebas', description: 'Integración SAP y pruebas',
          role: 'Desarrollo', hours: 40, stageCode: 'T01', submodule: 'Backend',
          referenceIds: ['R01', 'R09'], classification: 'C',
          roleEffort: [{ role: 'Desarrollo', hours: 24 }, { role: 'QA', hours: 16 }] }],
      }],
    };
    render(<QuotationPlanningAcceptanceCard
      version={quotationVersionSchema.parse(extended)}
      teamNames={new Map([[teamId, 'Desarrollo'], ['0777e456-fd76-445e-83f1-afc25061c106', 'QA']])}
    />);
    expect(screen.getByText('44 HH')).toBeInTheDocument();
    expect(screen.getByText('4 HH')).toBeInTheDocument();
    expect(screen.getByText('Construcción')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Portal'));
    expect(screen.getByText('24 HH')).toBeInTheDocument();
    expect(screen.getByText('16 HH')).toBeInTheDocument();
    expect(screen.getByText('Desarrollo:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('API y pruebas'));
    expect(screen.getByText(/Referencias: R01, R09/)).toBeInTheDocument();
    expect(screen.getByText(/Clasificación: C/)).toBeInTheDocument();
    expect(screen.getByText(/Tramo: T01/)).toBeInTheDocument();
  });

});
