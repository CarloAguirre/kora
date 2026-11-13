import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { estimationQuestionSchema } from '@kora/contracts';
import { AiQuotationWizardModal } from './AiQuotationWizardModal';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(), generate: vi.fn(), onClose: vi.fn(), toastError: vi.fn(),
  serviceAccountEnabled: true, oauthEnabled: true,
  browse: vi.fn(), driveAccess: vi.fn(), oauthStart: vi.fn(),
  resolve: vi.fn(), updateExtras: vi.fn(),
  activeTeams: [
    { teamId: '0777e456-fd76-445e-83f1-afc25061c121', name: 'Desarrollo', isActive: true },
    { teamId: '0777e456-fd76-445e-83f1-afc25061c122', name: 'QA', isActive: true },
  ],
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
    options: [
      { value: 'ideal', label: 'Equipo ideal' },
      { value: 'kora_availability', label: 'Disponibilidad real de Kora' },
      { value: 'compare', label: 'Comparar ambos escenarios' },
      { value: 'specific_profiles', label: 'Perfiles específicos' },
    ],
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
    useEstimationDriveOAuthPocStatus: () => ({ data: { enabled: mocks.oauthEnabled, serviceAccountEnabled: mocks.serviceAccountEnabled }, isLoading: false }),
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
  useQuotationActiveTeams: () => ({ data: mocks.activeTeams, isLoading: false, isFetching: false, isError: false }),
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
  mocks.oauthEnabled = true;
  mocks.activeTeams = [
    { teamId: '0777e456-fd76-445e-83f1-afc25061c121', name: 'Desarrollo', isActive: true },
    { teamId: '0777e456-fd76-445e-83f1-afc25061c122', name: 'QA', isActive: true },
  ];
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
  fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
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

  it('F03 habilita solo perfiles específicos y exige equipos reales antes de continuar', async () => {
    renderWizard();
    await analyzeAndConfirm();
    expect(screen.getByLabelText(/Disponibilidad real de Kora/)).toBeDisabled();
    expect(screen.getByLabelText(/Comparar ambos escenarios/)).toBeDisabled();
    expect(screen.getByLabelText('Perfiles específicos')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('MVP'));
    fireEvent.click(screen.getByLabelText('N semanas'));
    fireEvent.change(screen.getByLabelText('Número de semanas'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Ninguna'));
    fireEvent.click(screen.getByLabelText('Perfiles específicos'));
    expect(screen.getByRole('group', { name: 'Equipos específicos disponibles' }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getAllByRole('alert').map((item) => item.textContent).join(' '))
      .toContain('Completa la pregunta obligatoria');
    expect(screen.getByText('Condiciones de la estimación')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Desarrollo'));
    fireEvent.click(screen.getByLabelText('QA'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/aclaraciones de mayor impacto/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Sí'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Desarrollo, QA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    const payload = mocks.generate.mock.calls[0]![0] as {
      selectedTeamIds: string[]; answers: Array<{ questionId: string; value: unknown }>;
    };
    expect(payload.selectedTeamIds).toEqual([
      '0777e456-fd76-445e-83f1-afc25061c121',
      '0777e456-fd76-445e-83f1-afc25061c122',
    ]);
    expect(payload.answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: 'F03', value: 'specific_profiles' }),
    ]));
  });

  it('F03 al regresar a Equipo ideal descarta la selección específica', async () => {
    renderWizard();
    await analyzeAndConfirm();
    fireEvent.click(screen.getByLabelText('Perfiles específicos'));
    fireEvent.click(screen.getByLabelText('Desarrollo'));
    fireEvent.click(screen.getByLabelText('Equipo ideal'));
    expect(screen.queryByRole('group', { name: 'Equipos específicos disponibles' }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('MVP'));
    fireEvent.click(screen.getByLabelText('N semanas'));
    fireEvent.change(screen.getByLabelText('Número de semanas'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Ninguna'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByLabelText('Sí'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(mocks.generate.mock.calls[0]![0].selectedTeamIds).toEqual([]);
  });



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
    // Aun si OAuth experimental sigue encendido, la identidad corporativa
    // permite descubrir carpetas sin popup ni permiso del usuario.
    expect(mocks.driveAccess).not.toHaveBeenCalled();
    expect(mocks.oauthStart).not.toHaveBeenCalled();
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

  it('con Extras válido conecta directamente a su carpeta sin descubrir ni modificar Extras', async () => {
    renderWizard();
    expect(screen.queryByRole('button', { name: 'Analizar proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar carpeta de levantamiento en mi Drive' }))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Conectar con Google Drive' })).toHaveLength(1);
    expect(mocks.browse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith({
      projectId: project.id,
      authorizationFolderUrl: project.documentationLink,
      folderUrl: project.documentationLink,
    }));
    expect(await screen.findByRole('list', { name: 'Documentos que analizará el agente' }))
      .toBeInTheDocument();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.updateExtras).not.toHaveBeenCalled();
    expect(mocks.driveAccess).not.toHaveBeenCalled();
    expect(mocks.oauthStart).not.toHaveBeenCalled();
    expect(screen.getByText(/acceso corporativo a Drive/)).toBeInTheDocument();
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
    expect(screen.getByText('Actividad del agente IA en tiempo real')).toBeInTheDocument();
    const disclosure = screen.getByText('Actividad del agente IA en tiempo real').closest('details');
    expect(disclosure).toHaveAttribute('open');
    const log = screen.getByRole('log', { name: 'Resúmenes de razonamiento del agente IA' });
    expect(screen.getByRole('status', { name: 'Esperando respuesta del agente' })).toBeInTheDocument();
    expect(screen.queryByText('Resumen del modelo (opcional)')).not.toBeInTheDocument();
    expect(log).not.toHaveTextContent('El proveedor aún no ha enviado un resumen');
    expect(log).not.toHaveTextContent('La actividad muestra operaciones verificables');
    const request = mocks.analyze.mock.calls[0]![0] as {
      onThoughtSummary?: (text: string) => void;
      onProgress?: (phase: string, text: string, at?: string) => void;
      onHeartbeat?: (seconds: number) => void;
    };
    expect(request.onThoughtSummary).toEqual(expect.any(Function));
    expect(request.onProgress).toEqual(expect.any(Function));
    await act(async () => {
      request.onProgress?.('reading', 'Consultando documentos en Drive.');
      request.onProgress?.('documents', 'Documentación leída: 3 archivos.');
      request.onProgress?.('gemini', 'Enviando antecedentes a Gemini.');
      request.onHeartbeat?.(15);
    });
    expect(screen.getByRole('list', { name: 'Actividad verificada del servidor' })
      .querySelectorAll('li')).toHaveLength(4);
    expect(log).toHaveTextContent('15 s transcurridos');
    expect(log).toHaveTextContent('Consultando documentos en Drive.');
    expect(log).toHaveTextContent('Documentación leída: 3 archivos.');
    expect(log).toHaveTextContent('Enviando antecedentes a Gemini.');
    await act(async () => {
      request.onThoughtSummary?.('Gemini detectó dos módulos. ');
      request.onThoughtSummary?.('Hay una dependencia documental pendiente.');
    });
    expect(log).toHaveTextContent(
      'Gemini detectó dos módulos. Hay una dependencia documental pendiente.');
    expect(screen.queryByRole('status', { name: 'Esperando respuesta del agente' }))
      .not.toBeInTheDocument();
    expect(log).not.toHaveTextContent('Preparando preguntas de aclaración');
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await act(async () => { release(analysisResult); });
    expect(await screen.findByText('Entendimiento del proyecto')).toBeInTheDocument();
  });

  it('omite logger durante la lectura Drive y lo muestra al analizar, sin duplicar peticiones', async () => {
    let releaseBrowse!: (result: typeof previewResult) => void;
    const pendingBrowse = new Promise<typeof previewResult>((resolve) => {
      releaseBrowse = resolve;
    });
    mocks.browse.mockReturnValueOnce(pendingBrowse);
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
    expect(screen.getByRole('status', { name: 'Preparación de la documentación' }))
      .toHaveTextContent('Leyendo documentos');
    expect(screen.queryByRole('log', {
      name: 'Resúmenes de razonamiento del agente IA',
    })).not.toBeInTheDocument();
    expect(screen.queryByText('Actividad del agente IA en tiempo real')).not.toBeInTheDocument();
    releaseBrowse(previewResult);
    expect(await screen.findByText('Levantamiento QA')).toBeInTheDocument();

    let releaseAnalysis!: (result: typeof analysisResult) => void;
    mocks.analyze.mockReturnValueOnce(new Promise<typeof analysisResult>((resolve) => {
      releaseAnalysis = resolve;
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Analizar proyecto' }));
    expect(screen.getByRole('status', { name: 'Progreso del análisis IA' }))
      .toHaveTextContent('El agente IA está revisando antecedentes');
    expect(screen.getByRole('log', { name: 'Resúmenes de razonamiento del agente IA' }))
      .toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Esperando respuesta del agente' }))
      .toBeInTheDocument();
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


  it('si OAuth ya autorizó la carpeta de Extras, la reutiliza sin buscar ni volver a pedir permisos', async () => {
    mocks.serviceAccountEnabled = false;
    const popup = { close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      renderWizard();
      fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
      expect(await screen.findByRole('list', { name: 'Documentos que analizará el agente' }))
        .toBeInTheDocument();
      expect(mocks.driveAccess).toHaveBeenCalledWith({
        projectId: project.id, driveFolderUrl: project.documentationLink,
      });
      expect(mocks.browse).toHaveBeenCalledWith({
        projectId: project.id, authorizationFolderUrl: project.documentationLink,
        folderUrl: project.documentationLink,
      });
      expect(popup.close).toHaveBeenCalled();
      expect(popup.location.replace).not.toHaveBeenCalled();
      expect(mocks.oauthStart).not.toHaveBeenCalled();
      expect(mocks.resolve).not.toHaveBeenCalled();
      expect(mocks.updateExtras).not.toHaveBeenCalled();
      expect(mocks.analyze).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
  });

  it('desde Conectar con Google Drive autoriza la carpeta de Extras sin pedir otra', async () => {
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
      expect(screen.queryByRole('button', { name: 'Analizar proyecto' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Conectar con Google Drive' }));
      await waitFor(() => expect(mocks.oauthStart).toHaveBeenCalledWith({
        projectId: project.id,
        driveFolderUrl: 'https://drive.google.com/drive/folders/carpeta-qa-real',
      }));
      expect(open).toHaveBeenCalledOnce();
      expect(mocks.driveAccess).toHaveBeenCalledWith({
        projectId: project.id,
        driveFolderUrl: project.documentationLink,
      });
      expect(mocks.resolve).not.toHaveBeenCalled();
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
    expect(screen.getByText(/La carpeta de documentación ya está registrada en Extras/))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar con Google Drive' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Analizar proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Carpeta de Google Drive del proyecto')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '✦ Nueva cotización con el agente IA' }))
      .toBeInTheDocument();
    expect(screen.getByText('1. Análisis')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('2. Entendimiento')).toBeInTheDocument();
    expect(screen.queryByText('Abrir carpeta en Google Drive')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar carpeta de levantamiento en mi Drive' }))
      .not.toBeInTheDocument();
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


  it('OpenAI muestra alternativas, Otro editable y Sí/No, con validación y valor enviado a EDT', async () => {
    const single = estimationQuestionSchema.parse({
      ...dynamicQuestions[0], id: 'D01',
      question: '¿Qué integración se requiere?',
      options: [
        { value: 'native', label: 'Módulo nativo' },
        { value: 'api', label: 'Integración API' },
        { value: 'other', label: 'Otro (especificar)' },
      ],
    });
    const multiple = estimationQuestionSchema.parse({
      ...dynamicQuestions[0], id: 'D02',
      question: '¿Qué plataformas necesita?',
      answerType: 'multi_choice',
      options: [
        { value: 'web', label: 'Portal web' },
        { value: 'mobile', label: 'Aplicación móvil' },
        { value: 'other', label: 'Otro (especificar)' },
      ],
    });
    const confirmation = estimationQuestionSchema.parse({
      ...dynamicQuestions[0], id: 'D03',
      question: '¿Se requiere autenticación SSO?',
      answerType: 'confirmation', options: [],
    });
    mocks.analyze.mockResolvedValueOnce({
      ...analysisResult, provider: 'openai',
      dynamicQuestions: [single, multiple, confirmation],
    });
    renderWizard();
    await analyzeAndConfirm();
    answerFixed();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Aclaraciones de mayor impacto')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Otro (especificar)')).toHaveLength(2);
    expect(screen.getByLabelText('Portal web')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Sí')).toHaveAttribute('type', 'radio');

    // Seleccionar Otro sin describirlo no es una respuesta válida.
    fireEvent.click(screen.getAllByLabelText('Otro (especificar)')[0]!);
    expect(screen.getByLabelText('Especifica otra opción')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Completa la pregunta obligatoria: ¿Qué integración se requiere?');
    fireEvent.change(screen.getByLabelText('Especifica otra opción'), {
      target: { value: 'Conector SFTP por lotes' },
    });
    fireEvent.click(screen.getByLabelText('Portal web'));
    fireEvent.click(screen.getAllByLabelText('Otro (especificar)')[1]!);
    const extraChannel = document.getElementById('other-detail-D02');
    expect(extraChannel).toBeInTheDocument();
    fireEvent.change(extraChannel!, {
      target: { value: 'Aplicación de terreno offline' },
    });
    fireEvent.click(screen.getByLabelText('Sí'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Confirmar la estimación')).toBeInTheDocument();
    expect(screen.getByText(/Otro: Conector SFTP por lotes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    const payload = mocks.generate.mock.calls[0]![0] as {
      dynamicQuestions: Array<{ id: string }>;
      answers: Array<{ questionId: string; value: unknown; usedAssumption: boolean }>;
    };
    expect(payload.dynamicQuestions).toHaveLength(3);
    expect(payload.answers).toEqual(expect.arrayContaining([
      { questionId: 'D01', value: 'other:Conector SFTP por lotes', usedAssumption: false },
      { questionId: 'D02', value: ['web', 'other:Aplicación de terreno offline'],
        usedAssumption: false },
      { questionId: 'D03', value: true, usedAssumption: false },
    ]));
  });

  it('en el paso 5 muestra logger discreto y recibe resúmenes de propuesta y EDT en vivo', async () => {
    renderWizard();
    await analyzeToUnderstanding();
    fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
    answerFixed();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByLabelText('Sí'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Confirmar la estimación')).toBeInTheDocument();
    expect(screen.getByText('Actividad del agente IA en tiempo real')).toBeInTheDocument();
    expect(screen.getByText(/La cotización se guardará como borrador/)
      .closest('details')).toHaveAttribute('open');
    const log = screen.getByRole('log', { name: 'Resúmenes del agente IA durante la estimación' });
    expect(log).toHaveTextContent('Al generar la estimación');
    Object.defineProperty(log, 'scrollHeight', { value: 480, configurable: true });
    let resolve!: (value: { id: string }) => void;
    mocks.generate.mockImplementationOnce(() =>
      new Promise<{ id: string }>((res) => { resolve = res; }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    expect(screen.getByRole('status', { name: 'Esperando respuesta del agente' })).toBeInTheDocument();
    expect(log).not.toHaveTextContent('Resumen del modelo (opcional)');
    const input = mocks.generate.mock.calls[0]![0] as {
      onThoughtSummary?: (chunk: string) => void;
      onPhase?: (phase: 'proposal' | 'edt' | 'saving') => void;
      onActivity?: (step: string, text: string, at: string) => void;
      onHeartbeat?: (seconds: number, phase: string) => void;
    };
    expect(input.onThoughtSummary).toEqual(expect.any(Function));
    expect(mocks.generate).toHaveBeenCalledOnce();
    await act(async () => {
      input.onThoughtSummary?.('Evaluando perfiles y capacidades. ');
      input.onActivity?.('proposal_reading', 'Leyendo documentación para perfiles.', '2026-11-09T18:00:00Z');
      input.onActivity?.('proposal_model_request', 'Solicitando propuesta al agente IA.', '2026-11-09T18:00:01Z');
      input.onPhase?.('edt');
      input.onActivity?.('edt_model_request', 'Esperando respuesta de EDT.', '2026-11-09T18:00:02Z');
      input.onHeartbeat?.(15, 'edt');
      input.onThoughtSummary?.('Consolidando actividades y HH.');
    });
    expect(screen.getByRole('list', { name: 'Actividad de generación verificada' })
      .querySelectorAll('li')).toHaveLength(4);
    expect(log).toHaveTextContent('Leyendo documentación para perfiles.');
    expect(log).toHaveTextContent('Solicitando propuesta al agente IA.');
    expect(log).toHaveTextContent('Esperando respuesta de EDT.');
    expect(log).toHaveTextContent('15 s transcurridos');
    expect(log).toHaveTextContent('Evaluando perfiles y capacidades. Consolidando actividades y HH.');
    expect(screen.queryByRole('status', { name: 'Esperando respuesta del agente' }))
      .not.toBeInTheDocument();
    expect(log.scrollTop).toBe(480); // Último fragmento visible automáticamente.
    expect(screen.getByText('Construyendo EDT y estimando HH por actividad…'))
      .toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /Generando estimación/ })).toBeDisabled();
    await act(async () => { resolve({ id: 'version-qa' }); });
    expect(await screen.findByTestId('location')).toHaveTextContent('version=version-qa');
  });

  it('al seleccionar MVP adapta preguntas heredadas de PoC y envía el mismo texto a la propuesta', async () => {
    mocks.analyze.mockResolvedValueOnce({
      ...analysisResult,
      dynamicQuestions: [{
        ...dynamicQuestions[0]!,
        required: false,
        question: '¿Cómo debe relacionarse el PoC con los robots RPA existentes?',
        reason: '¿Qué componentes deben incluirse dentro del PoC?',
        options: [
          { value: 'reuse', label: 'Reutilizar los robots del PoC' },
          { value: 'exclude', label: 'Excluir los robots del PoC' },
        ],
      }],
    });
    renderWizard();
    await analyzeToUnderstanding();
    fireEvent.click(screen.getByRole('button', { name: 'Está correcto' }));
    answerFixed();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('¿Cómo debe relacionarse el MVP con los robots RPA existentes? · Opcional'))
      .toBeInTheDocument();
    expect(screen.getByText('Por qué preguntamos: ¿Qué componentes deben incluirse dentro del MVP?'))
      .toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Excluir los robots del MVP'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar estimación' }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    const payload = mocks.generate.mock.calls[0]![0] as {
      dynamicQuestions: Array<{
        question: string; options: Array<{ value: string; label: string }>;
        sourceRefs: Array<{ sourceId: string }>;
      }>;
      answers: Array<{ questionId: string; value: unknown }>;
    };
    expect(payload.dynamicQuestions[0]?.question).toContain('el MVP');
    expect(payload.dynamicQuestions[0]?.options[1]).toEqual({
      value: 'exclude', label: 'Excluir los robots del MVP',
    });
    expect(payload.dynamicQuestions[0]?.sourceRefs[0]?.sourceId).toBe('drive-requerimiento-qa');
    expect(payload.answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: 'F01', value: 'mvp' }),
      expect.objectContaining({ questionId: 'D01', value: 'exclude' }),
    ]));
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
      'El agente IA no consiguió analizar documentos reales de la carpeta indicada.',
    );
    expect(screen.queryByText('Entendimiento del proyecto')).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
