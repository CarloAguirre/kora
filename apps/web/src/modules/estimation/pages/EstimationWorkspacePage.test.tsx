import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { estimationQuestionSchema } from '@kora/contracts';
import { EstimationWorkspacePage } from './EstimationWorkspacePage';

const ids = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
};
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
const questions = [
  estimationQuestionSchema.parse({
    id: 'F01', kind: 'fixed', category: 'Alcance', question: '¿Alcance?',
    impact: 'high', answerType: 'single_choice', required: true,
    options: [{ value: 'mvp', label: 'MVP' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F02', kind: 'fixed', category: 'Plazo', question: '¿Plazo?',
    impact: 'high', answerType: 'text', required: true,
  }),
  estimationQuestionSchema.parse({
    id: 'F03', kind: 'fixed', category: 'Equipo', question: '¿Equipo?',
    impact: 'high', answerType: 'single_choice', required: true,
    options: [{ value: 'ideal', label: 'Equipo ideal' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F04', kind: 'fixed', category: 'Postproducción', question: '¿Postproducción?',
    impact: 'medium', answerType: 'multi_choice', required: true,
    options: [{ value: 'none', label: 'Ninguna' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F05', kind: 'fixed', category: 'Contexto', question: '¿Observaciones?',
    impact: 'low', answerType: 'text', required: false,
  }),
];
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/shared/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock('../hooks/useEstimationWorkspace', () => ({
  useEstimationWorkspace: () => ({
    project: {
      data: {
        id: ids.project, name: 'Portal de prueba',
        client: { companyName: 'Cliente QA' }, documentationLink: null,
      },
      error: null, isLoading: false,
    },
    isLoading: false,
  }),
}));
vi.mock('../api/estimation.queries', () => ({
  useEstimationQuestionnaireDefinition: () => ({
    data: { fixedQuestions: questions, maxDynamicFirstRound: 5,
      maxDynamicFollowUp: 2, targetMinutesMin: 3, targetMinutesMax: 5 },
    isLoading: false, isError: false,
  }),
  useGenerateAnsweredEstimationPocProposal: () => ({
    mutate: mocks.mutate, isPending: false, data: undefined, error: null,
  }),
}));

const renderWorkspace = () => render(
  <MemoryRouter initialEntries={[{
    pathname: '/estimar/' + ids.project,
    search: '?mode=ai',
    state: {
      creationMode: 'ai',
      driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-proyecto',
      instructions: 'Considerar pruebas de carga',
    },
  }]}>
    <Routes>
      <Route path="/estimar/:projectId" element={<EstimationWorkspacePage />} />
    </Routes>
  </MemoryRouter>,
);

describe('R4-a · EstimationWorkspacePage', () => {
  it('no llama Gemini ni genera una propuesta antes de contestar el cuestionario', () => {
    mocks.mutate.mockClear();
    renderWorkspace();
    expect(screen.getByText('¿Alcance?')).toBeInTheDocument();
    expect(screen.getByText(/R4-a · Confirma las preguntas F01–F05/)).toBeInTheDocument();
    expect(screen.queryByText('No se pudo generar la propuesta')).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('envía F01–F04 y el contexto de Drive al endpoint revisado', () => {
    mocks.mutate.mockClear();
    renderWorkspace();
    fireEvent.click(screen.getByLabelText('MVP'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta breve'), {
      target: { value: '8 semanas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByLabelText('Equipo ideal'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByLabelText('Ninguna'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente pregunta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación final' }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith({
      projectId: ids.project,
      projectName: 'Portal de prueba',
      clientName: 'Cliente QA',
      driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-proyecto',
      instructions: 'Considerar pruebas de carga',
      answers: [
        { questionId: 'F01', value: 'mvp', usedAssumption: false },
        { questionId: 'F02', value: '8 semanas', usedAssumption: false },
        { questionId: 'F03', value: 'ideal', usedAssumption: false },
        { questionId: 'F04', value: ['none'], usedAssumption: false },
      ],
    });
  });
});
