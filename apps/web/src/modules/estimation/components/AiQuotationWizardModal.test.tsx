import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { estimationQuestionSchema } from '@kora/contracts';
import { AiQuotationWizardModal } from './AiQuotationWizardModal';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(), generate: vi.fn(), onClose: vi.fn(), toastError: vi.fn(),
  serviceAccountEnabled: true,
  browse: vi.fn(), driveAccess: vi.fn(), oauthStart: vi.fn(),
  resolve: vi.fn(), updateExtras: vi.fn(),
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
    sourceId: 'drive-requerimiento-qa', fileName: 'Requerimiento_KDM.pdf',
  }],
  assumptionIfSkipped: 'API no disponible; estimar adaptador temporal.',
})];
const previewResult = {
  folder: { id: 'carpeta-qa-real', name: 'Levantamiento QA',
    url: 'https://drive.google.com/drive/folders/carpeta-qa-real', modifiedAt: null },
  parentFolder: null,
  siblingFolders: [{
    id: 'carpeta-hermana-real', name: 'Otra carpeta de requisitos',
    url: 'https://drive.google.com/drive/folders/carpeta-hermana-real', modifiedAt: null,
  }],
  childFolders: [{
    id: 'carpeta-hija-real', name: 'Historias de usuario',
    url: 'https://drive.google.com/drive/folders/carpeta-hija-real', modifiedAt: null,
  }],
  documents: [{
    id: 'drive-requerimiento-qa', name: 'Requerimiento_KDM.pdf',
    path: 'Requerimiento_KDM.pdf', mimeType: 'application/pdf', modifiedAt: null,
  }],
  coverage: { scannedItems: 1, eligibleDocuments: 1, analyzedDocuments: 1,
    scanTruncated: false, omitted: [] },
  siblingsUnavailable: false,
};
const analysisResult = {
  projectId: project.id, provider: 'gemini', sourceMode: 'drive',
  documentsAnalyzed: 1, detectedDocuments: ['Requerimiento_KDM.pdf'],
  summary: 'El motor centraliza notificaciones y requiere confirmar su API.',
  fixedPrefills: [{
    questionId: 'F01', value: 'mvp',
    sourceRefs: [{ sourceId: 'drive-requerimiento-qa',
      fileName: 'Requerimiento_KDM.pdf' }],
  }],
  dynamicQuestions,
};

vi.mock('../api/estimation.api', () => ({
  estimationApi: {
    browseDriveFolder: (input: unknown) => mocks.browse(input),
    resolveDriveFolder: (input: unknown) => mocks.resolve(input),
    driveOAuthPocAccess: (input: unknown) => mocks.driveAccess(input),
    startDriveOAuthPoc: (input: unknown) => mocks.oauthStart(input),
  },
}));
vi.mock('@/modules/projects/api/projects.queries', () => ({
  useUpdateProjectExtras: () => ({ mutateAsync: mocks.updateExtras }),
}));

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
    useEstimationDriveOAuthPocStatus: () => ({ data: { enabled: !mocks.serviceAccountEnabled, serviceAccountEnabled: mocks.serviceAccountEnabled }, isLoading: false }),
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
  mocks.serviceAccountEnabled = true;
  mocks.updateExtras.mockReset().mockResolvedValue(undefined);
  mocks.resolve.mockReset().mockResolvedValue({
    connection: 'connected', status: 'needs_confirmation',
    selectedFolder: null, message: 'Hay carpetas candidatas',
    candidates: [{
      folderId: 'levantamiento-nuevo', name: 'Motor de notificaciones / Levantamiento',
      url: 'https://drive.google.com/drive/folders/levantamiento-nuevo',
      score: 68, confidence: 'medium',
      reasons: ['Nombre compatible con el proyecto.'],
      ancestorNames: ['Cliente QA'],
    }, {
      folderId: 'levantamiento-antiguo', name: 'Motor de notificaciones (cerrado)',
      url: 'https://drive.google.com/drive/folders/levantamiento-antiguo',
      score: 45, confidence: 'low',
      reasons: ['Puede ser un trabajo anterior.'],
      ancestorNames: ['Cliente QA'],
    }],
  });
  mocks.browse.mockReset().mockImplementation(async (input: { folderUrl: string }) => ({
    ...previewResult,
    folder: { ...previewResult.folder, url: input.folderUrl,
      name: input.folderUrl.includes('carpeta-hermana-real') ?
        'Otra carpeta de requisitos' : 'Levantamiento QA' },
    documents: input.folderUrl.includes('carpeta-hermana-real')
      ? [{ ...previewResult.documents[0], id: 'doc-hermano', name: 'Alcance nuevo.pdf' }]
      : previewResult.documents,
  }));
  mocks.driveAccess.mockReset().mockResolvedValue({ authorized: true });
  mocks.oauthStart.mockReset().mockResolvedValue({
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
  });
});

async function prepareDocuments() {
  fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
  expect(await screen.findByRole('list', { name: 'Documentos que analizará el agente' }))
    .toBeInTheDocument();
}
async function analyzeToUnderstanding() {
  await prepareDocuments();
  fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
  expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
}
async function analyzeAndConfirm() {
  await analyzeToUnderstanding();
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

  it('descubre carpetas sin URL previa y guarda la seleccionada en Extras', async () => {
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
      projectId: project.id, projectName: project.name,
      clientName: 'Cliente QA', documentationLink: null, quotationLink: null,
    }));
    const group = await screen.findByRole('group', { name: 'Carpetas candidatas' });
    const radios = group.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    fireEvent.click(radios[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar carpeta' }));
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith(expect.objectContaining({
      folderUrl: 'https://drive.google.com/drive/folders/levantamiento-antiguo',
    })));
    await waitFor(() => expect(mocks.updateExtras).toHaveBeenCalledWith({
      projectId: project.id,
      input: { documentationLink: 'https://drive.google.com/drive/folders/levantamiento-antiguo' },
    }));
    expect(mocks.analyze).not.toHaveBeenCalled();
  });


  it('no modifica Extras cuando Drive devuelve una carpeta sin archivos', async () => {
    mocks.browse.mockResolvedValueOnce({
      ...previewResult,
      documents: [],
      coverage: {
        scannedItems: 0, eligibleDocuments: 0, analyzedDocuments: 0,
        scanTruncated: false, omitted: [],
      },
    });
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    await screen.findByRole('group', { name: 'Carpetas candidatas' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar carpeta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Drive no devolvió archivos de esta carpeta');
    expect(mocks.updateExtras).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('al confirmar otra carpeta reemplaza el enlace anterior de Extras', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', {
      name: 'Buscar carpeta de levantamiento en mi Drive',
    }));
    await screen.findByRole('group', { name: 'Carpetas candidatas' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar carpeta' }));
    await waitFor(() => expect(mocks.updateExtras).toHaveBeenCalledWith({
      projectId: project.id,
      input: { documentationLink: 'https://drive.google.com/drive/folders/levantamiento-nuevo' },
    }));
    expect(await screen.findByRole('list', { name: 'Documentos que analizará el agente' }))
      .toBeInTheDocument();
  });

  it('sin candidatas presenta el aviso amarillo, enlace manual y confirmación protegida', async () => {
    mocks.resolve.mockResolvedValueOnce({
      connection: 'connected', status: 'not_found', selectedFolder: null,
      candidates: [], message: 'Sin coincidencias',
    });
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No encontramos carpetas con documentación compatible');
    expect(alert).toHaveTextContent('Motor de notificaciones');
    expect(alert.className).toContain('discoveryNoResultsWarning');
    expect(screen.queryByRole('group', { name: 'Carpetas candidatas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Carpeta de levantamiento del proyecto')).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar carpeta' });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(mocks.updateExtras).not.toHaveBeenCalled();
    expect(mocks.browse).not.toHaveBeenCalled();

    const input = screen.getByLabelText('O pega el link de la carpeta');
    fireEvent.change(input, { target: { value: 'https://example.com/folders/no-es-drive' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: {
      value: 'https://drive.google.com/drive/folders/carpeta-seleccion-manual',
    } });
    expect(confirm).toBeEnabled();
    expect(mocks.updateExtras).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith(expect.objectContaining({
      folderUrl: 'https://drive.google.com/drive/folders/carpeta-seleccion-manual',
    })));
    await waitFor(() => expect(mocks.updateExtras).toHaveBeenCalledWith({
      projectId: project.id,
      input: { documentationLink: 'https://drive.google.com/drive/folders/carpeta-seleccion-manual' },
    }));
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('si Drive no estuvo disponible no confunde el error con ausencia de carpetas', async () => {
    mocks.resolve.mockResolvedValueOnce({
      connection: 'unavailable', status: 'not_found', selectedFolder: null,
      candidates: [], message: 'Drive no disponible',
    });
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('No fue posible verificar las carpetas de Drive');
    expect(screen.queryByText(/No encontramos carpetas con documentación compatible/))
      .not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar carpeta' })).toBeDisabled();
  });

  it('OAuth sin URL activa descubrimiento del usuario y no inicia análisis Gemini', async () => {
    mocks.serviceAccountEnabled = false;
    mocks.driveAccess.mockResolvedValueOnce({ authorized: false })
      .mockResolvedValue({ authorized: true });
    const popup = { close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      renderWizard({ ...project, documentationLink: null } as ProjectDetail);
      fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
      await waitFor(() => expect(mocks.oauthStart).toHaveBeenCalledWith({
        projectId: project.id,
      }));
      expect(mocks.driveAccess).toHaveBeenCalledWith({ projectId: project.id });
      const event = new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'kora-drive-oauth-poc', status: 'ok', code: 'DRIVE_DISCOVERY_READY' },
      });
      Object.defineProperty(event, 'source', { value: popup });
      await act(async () => { window.dispatchEvent(event); });
      await screen.findByRole('group', { name: 'Carpetas candidatas' });
      expect(mocks.resolve).toHaveBeenCalledOnce();
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(mocks.updateExtras).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
  });


  it('al cambiar de carpeta hermana lista los documentos nuevos y no mantiene los anteriores', async () => {
    renderWizard();
    await prepareDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    const picker = screen.getByRole('dialog', { name: 'Elegir carpeta del proyecto' });
    expect(picker).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Otra carpeta de requisitos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar carpeta' }));
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith(expect.objectContaining({
      authorizationFolderUrl: 'https://drive.google.com/drive/folders/carpeta-qa-real',
      folderUrl: 'https://drive.google.com/drive/folders/carpeta-hermana-real',
    })));
    expect(await screen.findByText('Alcance nuevo.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Requerimiento_KDM.pdf')).not.toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    await waitFor(() => expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-hermana-real',
    })));
  });


  it('despliega los resúmenes reales de Gemini mientras analiza y no inventa pasos', async () => {
    renderWizard();
    await prepareDocuments();
    let release!: (result: typeof analysisResult) => void;
    mocks.analyze.mockImplementationOnce(() => new Promise<typeof analysisResult>(
      (resolve) => { release = resolve; },
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(screen.getByText('Ver razonamiento resumido de Gemini')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver razonamiento resumido de Gemini'));
    const log = screen.getByRole('log', { name: 'Resúmenes de razonamiento de Gemini' });
    expect(log).toHaveTextContent('aún no ha enviado resúmenes');
    const request = mocks.analyze.mock.calls[0]![0] as {
      onThoughtSummary?: (text: string) => void;
    };
    expect(request.onThoughtSummary).toEqual(expect.any(Function));
    await act(async () => {
      request.onThoughtSummary?.('Gemini detectó dos módulos. ');
      request.onThoughtSummary?.('Hay una dependencia documental pendiente.');
    });
    expect(log).toHaveTextContent(
      'Gemini detectó dos módulos. Hay una dependencia documental pendiente.');
    expect(log).not.toHaveTextContent('Preparando preguntas de aclaración');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await act(async () => { release(analysisResult); });
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
  });

  it('muestra progreso real de lectura y solicitud a Gemini, sin duplicar peticiones', async () => {
    let releaseBrowse!: (result: typeof previewResult) => void;
    const pendingBrowse = new Promise<typeof previewResult>((resolve) => {
      releaseBrowse = resolve;
    });
    mocks.browse.mockReturnValueOnce(pendingBrowse);
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(screen.getByRole('status', { name: 'Preparación de la documentación' }))
      .toHaveTextContent('Leyendo documentos');
    releaseBrowse(previewResult);
    expect(await screen.findByText('Levantamiento QA')).toBeInTheDocument();

    let releaseAnalysis!: (result: typeof analysisResult) => void;
    mocks.analyze.mockReturnValueOnce(new Promise<typeof analysisResult>((resolve) => {
      releaseAnalysis = resolve;
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(screen.getByRole('status', { name: 'Progreso del análisis IA' }))
      .toHaveTextContent('Gemini está revisando antecedentes');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    releaseAnalysis(analysisResult);
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it('explica por qué los PDF de una carpeta compartida no pudieron leerse', async () => {
    mocks.browse.mockResolvedValueOnce({
      ...previewResult, documents: [],
      coverage: {
        scannedItems: 5, eligibleDocuments: 2, analyzedDocuments: 0,
        scanTruncated: false,
        omitted: [
          { path: '1.10 Protocolo Relocalización.pdf',
            reason: 'falló la lectura del archivo (Google Drive respondió HTTP 403)' },
          { path: 'Cronograma Gantt.xlsx', reason: 'formato no compatible con el lector' },
        ],
      },
    });
    renderWizard();
    await prepareDocuments();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Drive detectó 2 archivo(s) compatible(s), pero no pudo leerlos');
    expect(screen.getByRole('list', { name: 'Archivos omitidos en Drive' }))
      .toHaveTextContent('1.10 Protocolo Relocalización.pdf');
    expect(screen.getByRole('list', { name: 'Archivos omitidos en Drive' }))
      .toHaveTextContent('HTTP 403');
    expect(screen.getByText(/Los Excel .xlsx aún no se leen directamente/))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analizar proyecto' })).toBeDisabled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('bloquea análisis cuando solo hay formatos incompatibles y detalla los descartes', async () => {
    mocks.browse.mockResolvedValueOnce({
      ...previewResult,
      documents: [],
      coverage: {
        scannedItems: 2, eligibleDocuments: 0, analyzedDocuments: 0,
        scanTruncated: false,
        omitted: [{ path: 'Cronograma.xlsx', reason: 'formato no compatible con el lector' }],
      },
    });
    renderWizard();
    await prepareDocuments();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Drive encontró 2 elemento(s), pero ningún documento compatible');
    expect(screen.getByRole('list', { name: 'Archivos omitidos en Drive' }))
      .toHaveTextContent('Cronograma.xlsx');
    expect(screen.getByRole('button', { name: 'Analizar proyecto' })).toBeDisabled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });


  it('desde Analizar proyecto abre OAuth automáticamente sin botones de prueba ni confirmación', async () => {
    mocks.serviceAccountEnabled = false;
    mocks.driveAccess.mockResolvedValueOnce({ authorized: false })
      .mockResolvedValue({ authorized: true });
    const popup = { close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      renderWizard();
      expect(screen.queryByText('Indicaciones adicionales · opcional')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Probar acceso|Comprobar autorización/ }))
        .not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
      await waitFor(() => expect(mocks.oauthStart).toHaveBeenCalledWith({
        projectId: project.id,
        driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-qa-real',
      }));
      expect(open).toHaveBeenCalledOnce();
      expect(popup.location.replace).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com'));
      expect(mocks.analyze).not.toHaveBeenCalled();
      // COOP puede bloquear window.opener; el backend valida la autorización.
      const data = {
        type: 'kora-drive-oauth-poc', status: 'ok', code: 'DRIVE_READ_SUCCESS', message: 'OK',
      };
      const event = new MessageEvent('message', { origin: window.location.origin, data });
      Object.defineProperty(event, 'source', { value: popup });
      await act(async () => { window.dispatchEvent(event); });
      await waitFor(() => expect(mocks.browse).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Levantamiento QA')).toBeInTheDocument();
    } finally {
      open.mockRestore();
    }
  });

  it('sin carpeta en Extras presenta una sola conexión nativa y conserva el descubrimiento', async () => {
    renderWizard({ ...project, documentationLink: null } as ProjectDetail);
    expect(screen.getByText(/El proyecto no tiene una carpeta en Extras/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analizar proyecto' })).not.toBeInTheDocument();
    const connect = screen.getByRole('button', { name: 'Conectar con Google Drive' });
    expect(connect.className).toContain('secondary');
    expect(connect).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('O pega el enlace de otra carpeta')).not.toBeInTheDocument();
    fireEvent.click(connect);
    await screen.findByRole('group', { name: 'Carpetas candidatas' });
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.updateExtras).not.toHaveBeenCalled();
    expect(screen.getByLabelText('O pega el enlace de otra carpeta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar carpeta' })).toBeInTheDocument();
  });

  it('si Extras apunta a otro tipo de enlace no suplanta documentos con KDM', () => {
    renderWizard({ ...project, documentationLink: 'https://example.com/docs' } as ProjectDetail);
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    expect(screen.getByText(/El enlace registrado en Extras no corresponde/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar con Google Drive' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Analizar proyecto' })).not.toBeInTheDocument();
  });

  it('toma la carpeta Drive de Extras sin solicitar ingresar otra URL', async () => {
    renderWizard();
    expect(screen.getByRole('navigation', {
      name: 'Etapas del asistente de cotización',
    })).toBeInTheDocument();
    expect(screen.getByText('Carpeta de documentación registrada en Extras')).toBeInTheDocument();
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '✦ Nueva cotización con el agente IA' }))
      .toBeInTheDocument();
    expect(screen.getByText('1. Análisis')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('2. Entendimiento')).toBeInTheDocument();
    expect(screen.getByText('Abrir carpeta en Google Drive')).toBeInTheDocument();
    expect(screen.queryByText('Indicaciones adicionales · opcional')).not.toBeInTheDocument();
    await prepareDocuments();
    expect(screen.getByText('Levantamiento QA')).toBeInTheDocument();
    const instructions = screen.getByText('Indicaciones adicionales · opcional').closest('details');
    expect(instructions).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Indicaciones adicionales · opcional'));
    expect(instructions).toHaveAttribute('open');
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    // Ya estamos en la previsualización: el segundo clic envía la solicitud
    // a Gemini. No se debe volver a ejecutar prepareDocuments().
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
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
    await analyzeToUnderstanding();
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
    await analyzeToUnderstanding();
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
    await prepareDocuments();
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gemini no consiguió analizar documentos reales de la carpeta indicada.',
    );
    expect(screen.queryByText('Entendimiento del proyecto')).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
