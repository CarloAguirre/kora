import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { estimationQuestionSchema } from '@kora/contracts';
import { AiQuotationWizardModal } from './AiQuotationWizardModal';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(), generate: vi.fn(), onClose: vi.fn(), toastError: vi.fn(),
}));
const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  slug: 'proyecto-prueba',
  name: 'Motor de notificaciones',
  client: { companyName: 'Cliente QA' },
  documentationLink: 'https://drive.google.com/drive/folders/carpeta-qa-real',
} as unknown as ProjectDetail;
const fixedQuestions = [
  estimationQuestionSchema.parse({
    id: 'F01', kind: 'fixed', category: 'Alcance', question: '¿Nivel de entrega?',
    impact: 'high', answerType: 'single_choice', required: true, canPrefill: true,
    options: [{ value: 'mvp', label: 'MVP' }, { value: 'poc', label: 'PoC' }],
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
    options: [{ value: 'none', label: 'Ninguna' }, { value: 'uat', label: 'UAT' }],
  }),
  estimationQuestionSchema.parse({
    id: 'F05', kind: 'fixed', category: 'Contexto', question: '¿Observaciones?',
    impact: 'low', answerType: 'text', required: false,
  }),
];
const dynamicQuestions = [estimationQuestionSchema.parse({
  id: 'D01', kind: 'dynamic', category: 'Integraciones',
  question: '¿Existe API SAP documentada?',
  reason: 'Puede modificar la integración y las HH.',
  impact: 'high', answerType: 'single_choice', required: true,
  options: [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }],
  sourceRefs: [{
    sourceId: 'kora-poc-requerimiento-kdm', fileName: 'Requerimiento_KDM.pdf',
  }],
  assumptionIfSkipped: 'API no disponible; estimar adaptador temporal.',
})];
const analysisResult = {
  projectId: project.id, provider: 'gemini', sourceMode: 'drive',
  documentsAnalyzed: 1, detectedDocuments: ['Requerimiento_KDM.pdf'],
  summary: 'El motor centraliza notificaciones y requiere confirmar su API.',
  fixedPrefills: [{
    questionId: 'F01', value: 'mvp',
    sourceRefs: [{ sourceId: 'kora-poc-requerimiento-kdm',
      fileName: 'Requerimiento_KDM.pdf' }],
  }],
  dynamicQuestions,
};

vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ error: mocks.toastError }),
}));
vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: {
    title: string; children: ReactNode; footer?: ReactNode;
  }) => <section role="dialog" aria-label={title}>{children}{footer}</section>,
}));
vi.mock('../api/estimation.queries', async () => {
  const React = await import('react');
  return {
    useEstimationDriveOAuthPocStatus: () => ({ data: { enabled: true, serviceAccountEnabled: true }, isLoading: false }),
    useEstimationQuestionnaireDefinition: () => ({
      data: { fixedQuestions, maxDynamicFirstRound: 5,
        maxDynamicFollowUp: 2, targetMinutesMin: 3, targetMinutesMax: 5 },
      isLoading: false, isError: false,
    }),
    useAnalyzeEstimationPoc: () => {
      const [data, setData] = React.useState<typeof analysisResult | null>(null);
      return {
        data, isPending: false,
        mutateAsync: async (input: unknown) => {
          const next = await mocks.analyze(input);
          setData(next);
          return next;
        },
      };
    },
  };
});
vi.mock('../api/quotation.queries', () => ({
  useGenerateAiDemoQuotationVersion: () => ({
    isPending: false, mutateAsync: mocks.generate,
  }),
}));
const Location = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
};
const renderWizard = (selectedProject: ProjectDetail = project) => render(
  <MemoryRouter initialEntries={['/proyectos/proyecto-prueba']}>
    <Location />
    <AiQuotationWizardModal project={selectedProject} onClose={mocks.onClose} />
  </MemoryRouter>,
);

beforeEach(() => {
  mocks.analyze.mockReset().mockResolvedValue(analysisResult);
  mocks.generate.mockReset().mockResolvedValue({
    id: '0777e456-fd76-445e-83f1-afc25061c109',
  });
  mocks.onClose.mockClear();
  mocks.toastError.mockReset();
});

async function analyzeAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
  expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
  expect(screen.getByText('Condiciones de la estimación')).toBeInTheDocument();
}
function answerFixed() {
  fireEvent.click(screen.getByLabelText('MVP'));
  fireEvent.click(screen.getByLabelText('N semanas'));
  fireEvent.change(screen.getByLabelText('Número de semanas'), { target: { value: '8' } });
  fireEvent.click(screen.getByLabelText('Equipo ideal'));
  fireEvent.click(screen.getByLabelText('UAT'));
  fireEvent.click(screen.getByLabelText('Ninguna'));
}

describe('Asistente v5 de cotización · sistema visual Kora', () => {
  it('pide el enlace de Drive únicamente cuando Extras no tiene documentación', async () => {
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    const input = screen.getByLabelText('Carpeta de Google Drive del proyecto');
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Analizar proyecto' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'https://drive.google.com/drive/folders/carpeta-nueva-real' } });
    expect(screen.getByRole('button', { name: 'Analizar proyecto' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    await waitFor(() => expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-nueva-real',
    })));
  });

  it('si Extras apunta a otro tipo de enlace no suplanta documentos con KDM', () => {
    renderWizard({ ...project, documentationLink: 'https://example.com/docs' } as ProjectDetail);
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    expect(screen.getByText(/Actualízalo desde la pestaña Extras/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analizar proyecto' })).toBeDisabled();
  });

  it('toma la carpeta Drive de Extras sin solicitar ingresar otra URL', async () => {
    renderWizard();
    expect(screen.getByRole('navigation', {
      name: 'Etapas del asistente de cotización',
    })).toBeInTheDocument();
    expect(screen.getByText('Carpeta de documentación configurada en Extras')).toBeInTheDocument();
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    // Atributos visuales/semánticos tomados del HTML v5: título con ✦,
    // stepper en píldoras y listado compacto de documentos.
    expect(screen.getByRole('dialog', { name: '✦ Nueva cotización con el agente IA' }))
      .toBeInTheDocument();
    expect(screen.getByText('1. Análisis')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('2. Entendimiento')).toBeInTheDocument();
    expect(screen.getByText('Abrir documentación en Google Drive')).toBeInTheDocument();
    const instructions = screen.getByText('Indicaciones adicionales · opcional').closest('details');
    expect(instructions).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Indicaciones adicionales · opcional'));
    expect(instructions).toHaveAttribute('open');
    expect(screen.getByText(/Carpeta de Drive autorizada para analizar/)).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-qa-real',
    }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('permite corregir el entendimiento, valida las fijas agrupadas y conserva respuestas', async () => {
    renderWizard();
    await analyzeAndConfirm();
    expect(screen.getByLabelText('MVP')).toBeChecked();
    expect(screen.getByText(/Prellenada desde el documento:/)).toBeInTheDocument();
    // No avanza hasta completar F01-F04, pero F05 es opcional.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Condiciones de la estimación')).toBeInTheDocument();
    expect(screen.getByText('Completa la pregunta obligatoria: ¿Plazo?')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Completa la pregunta obligatoria: ¿Plazo?');
    answerFixed();
    expect(screen.getByLabelText('UAT')).not.toBeChecked();
    expect(screen.getByLabelText('Ninguna')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Aclaraciones de mayor impacto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByLabelText('MVP')).toBeChecked();
    expect(screen.getByLabelText('Número de semanas')).toHaveValue(8);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('admite un supuesto explícito y envía confirmación completa antes de crear la versión', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const summary = screen.getByLabelText('Resumen editable');
    fireEvent.change(summary, { target: {
      value: 'Resumen corregido: plataforma centralizada, sin integración SAP real.',
    } });
    fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
    answerFixed();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByLabelText(/No lo sé \/ dejar como supuesto/));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Confirmar la estimación')).toBeInTheDocument();
    expect(screen.getAllByText(/API no disponible; estimar adaptador temporal/).length).toBeGreaterThan(0);
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      confirmedUnderstanding: 'Resumen corregido: plataforma centralizada, sin integración SAP real.',
      dynamicQuestions: expect.arrayContaining([
        expect.objectContaining({ id: 'D01', kind: 'dynamic' }),
      ]),
      answers: [
        { questionId: 'F01', value: 'mvp', usedAssumption: false },
        { questionId: 'F02', value: 'N semanas: 8', usedAssumption: false },
        { questionId: 'F03', value: 'ideal', usedAssumption: false },
        { questionId: 'F04', value: ['none'], usedAssumption: false },
        { questionId: 'D01', value: null, usedAssumption: true },
      ],
    }));
    await waitFor(() => expect(mocks.onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/proyectos/proyecto-prueba/cotizacion?version=',
    ));
  });

  it('no permite confirmar un resumen vacío y conserva el modal si falla la generación', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('Gemini no está disponible'));
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Resumen editable'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
    expect(screen.getByText(/debe contener al menos 20 caracteres/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Resumen editable'), {
      target: { value: 'Confirmado: portal de notificaciones de prueba.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
    answerFixed();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByLabelText('Sí'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect(await screen.findByText('Gemini no está disponible')).toBeInTheDocument();
    expect(screen.getByText('Confirmar la estimación')).toBeInTheDocument();
    expect(mocks.onClose).not.toHaveBeenCalled();
  });

  it('no sustituye Gemini por datos simulados si el análisis falla o devuelve otro proveedor', async () => {
    mocks.analyze.mockResolvedValueOnce({
      ...analysisResult, provider: 'poc-ai',
    });
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se obtuvo un análisis real de Gemini',
    );
    expect(screen.queryByText('Entendimiento del proyecto')).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
