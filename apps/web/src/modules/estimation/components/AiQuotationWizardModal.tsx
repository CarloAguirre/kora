import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  EstimationAnswerValue,
  EstimationQuestion,
  ProjectDetail,
  SubmitEstimationAnswerInput,
  EstimationPocAnalysis,
  EstimationDriveFolderResolution,
} from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useUpdateProjectExtras } from '@/modules/projects/api/projects.queries';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useToast } from '@/shared/components/ui/Toast';
import { TextField } from '@/shared/components/ui/TextField';
import {
  useAnalyzeEstimationPoc,
  useEstimationQuestionnaireDefinition,
  useEstimationDriveOAuthPocStatus,
} from '../api/estimation.queries';
import { estimationApi, type DriveBrowseResult, type DriveBrowseFolder } from '../api/estimation.api';
import { FileTextIcon, FolderOpenIcon, CheckIcon } from '@/shared/components/icons/Icons';
import { useGenerateAiDemoQuotationVersion } from '../api/quotation.queries';
import styles from './AiQuotationWizardModal.module.css';

const STAGES = ['Análisis', 'Entendimiento', 'Condiciones', 'Aclaraciones', 'Confirmación'] as const;

function isRealDriveFolderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'drive.google.com' &&
      /\/folders\/[A-Za-z0-9_-]+/.test(url.pathname) &&
      !url.pathname.includes('/folders/kora-poc-fallback');
  } catch {
    return false;
  }
}

type AnswerState = Record<string, EstimationAnswerValue>;

function hasValue(value: EstimationAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function matchesQuestion(question: EstimationQuestion, value: unknown): value is EstimationAnswerValue {
  if (question.answerType === 'text' || question.answerType === 'date') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (question.answerType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (question.answerType === 'confirmation') return typeof value === 'boolean';
  if (question.answerType === 'single_choice') {
    return typeof value === 'string' && question.options.some((option) => option.value === value);
  }
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === 'string' &&
      question.options.some((option) => option.value === item));
}

function displayAnswer(question: EstimationQuestion, value: EstimationAnswerValue | undefined): string {
  if (value === undefined || value === null) return 'No respondida';
  const map = (item: string) => question.options.find((option) => option.value === item)?.label ?? item;
  if (Array.isArray(value)) return value.map(map).join(', ');
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return typeof value === 'string' ? map(value) : String(value);
}

function QuestionField({
  question, value, assumed, onChange, onAssume, error, prefillSource,
}: {
  question: EstimationQuestion;
  value: EstimationAnswerValue | undefined;
  assumed: boolean;
  onChange: (value: EstimationAnswerValue) => void;
  onAssume: () => void;
  error: boolean;
  prefillSource?: string;
}) {
  const selected = (key: string) =>
    Array.isArray(value) ? value.includes(key) : value === key;
  const plazo = typeof value === 'string' && !assumed ? value : '';
  const dateMode = plazo.startsWith('Fecha objetivo:');
  const weeksMode = plazo.startsWith('N semanas:');
  const customMode = question.id === 'F02' &&
    !dateMode && !weeksMode && plazo !== 'Sin restricción';

  // Control nativo, pero con apariencia de píldora v5.
  // Los radios/checkboxes permanecen accesibles por teclado.
  const choice = (key: string, label: string, multi = false) => {
    const disabled = question.id === 'F03' && key !== 'ideal';
    const checked = selected(key) && !assumed;
    return (
      <label key={key} className={[
        styles.choice, checked ? styles.choiceSelected : '',
        disabled ? styles.choiceDisabled : '',
      ].filter(Boolean).join(' ')}>
        <input type={multi ? 'checkbox' : 'radio'} name={question.id}
          value={key} checked={checked} disabled={disabled}
          onChange={() => {
            if (!multi) { onChange(key); return; }
            const current = Array.isArray(value) && !assumed ? value : [];
            if (key === 'none') {
              onChange(current.includes('none') ? [] : ['none']);
            } else {
              onChange(current.includes(key)
                ? current.filter((item) => item !== key)
                : [...current.filter((item) => item !== 'none'), key]);
            }
          }} />
        <span><strong>{label}</strong>
          {disabled && <small>Disponible al integrar capacidad real de Kora</small>}
        </span>
      </label>
    );
  };
  return (
    <fieldset className={styles.question}>
      <legend>
        <span className={styles.category}>
          {question.kind === 'fixed' ? 'Condición' : question.category}
          {prefillSource && <span className={styles.prefill}>Prellenada</span>}
        </span>
        <span className={styles.questionTitle}>
          {question.question}{question.required ? ' *' : ' · Opcional'}
        </span>
      </legend>
      {question.kind === 'dynamic' && question.reason &&
        <p className={styles.reason}>Por qué preguntamos: {question.reason}</p>}
      {question.id === 'F02' && (
        <div className={styles.schedule}>
          <div className={styles.options}>
            {([
              ['Sin restricción', plazo === 'Sin restricción', 'Sin restricción'],
              ['Fecha objetivo', dateMode, 'Fecha objetivo: '],
              ['N semanas', weeksMode, 'N semanas: '],
            ] as const).map(([label, checked, next]) => (
              <label key={label} className={[
                styles.choice, checked ? styles.choiceSelected : '',
              ].filter(Boolean).join(' ')}>
                <input type="radio" name="plazo-objetivo" checked={checked}
                  onChange={() => onChange(next)} />
                <span><strong>{label}</strong></span>
              </label>
            ))}
          </div>
          {dateMode && <TextField type="date" label="Fecha objetivo"
            value={plazo.slice('Fecha objetivo:'.length).trim()}
            onChange={(event) => onChange('Fecha objetivo: ' + event.target.value)} />}
          {weeksMode && <TextField type="number" min={1} label="Número de semanas"
            value={plazo.slice('N semanas:'.length).trim()}
            onChange={(event) => onChange('N semanas: ' + event.target.value)} />}
          {customMode && <TextField label="Plazo descrito"
            value={plazo} placeholder="Ej. Ocho semanas a partir del kickoff"
            onChange={(event) => onChange(event.target.value)} />}
        </div>
      )}
      {question.answerType === 'text' && question.id !== 'F02' &&
        <textarea aria-label={question.question} className={styles.textarea}
          placeholder="Escribe una respuesta breve"
          value={typeof value === 'string' && !assumed ? value : ''}
          onChange={(event) => onChange(event.target.value)} />}
      {question.answerType === 'date' &&
        <TextField label={question.question} type="date"
          value={typeof value === 'string' && !assumed ? value : ''}
          onChange={(event) => onChange(event.target.value)} />}
      {question.answerType === 'number' &&
        <TextField label={question.question} type="number"
          value={typeof value === 'number' && !assumed ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))} />}
      {question.answerType === 'confirmation' &&
        <div className={styles.options}>
          {([['Sí', true], ['No', false]] as const).map(([label, option]) => (
            <label key={label} className={[
              styles.choice, value === option && !assumed ? styles.choiceSelected : '',
            ].filter(Boolean).join(' ')}>
              <input type="radio" name={question.id}
                checked={value === option && !assumed} onChange={() => onChange(option)} />
              <span>{label}</span>
            </label>
          ))}
        </div>}
      {(question.answerType === 'single_choice' || question.answerType === 'multi_choice') &&
        <div className={styles.options}>
          {question.options.map((item) =>
            choice(item.value, item.label, question.answerType === 'multi_choice'))}
        </div>}
      {question.kind === 'dynamic' && question.assumptionIfSkipped && (
        <label className={[
          styles.choice, styles.choiceAssumption,
          assumed ? styles.choiceSelected : '',
        ].filter(Boolean).join(' ')}>
          <input type="checkbox" checked={assumed}
            onChange={() => {
              if (assumed) onChange(null);
              else onAssume();
            }} />
          <span><strong>No lo sé / dejar como supuesto</strong>
            <small>{question.assumptionIfSkipped}</small></span>
        </label>
      )}
      {prefillSource && <p className={styles.source}>
        Prellenada desde el documento: <span className={styles.sourceBadge}>{prefillSource}</span>.
        Puedes corregirla.
      </p>}
      {question.sourceRefs.length > 0 &&
        <p className={styles.source}>
          Fuente: {question.sourceRefs.map((source) =>
            source.fileName + (source.excerpt ? ' · ' + source.excerpt : '')).join(' / ')}
        </p>}
      {error &&
        <p role="alert" className={styles.error}>
          Responde esta pregunta antes de continuar o utiliza un supuesto permitido.
        </p>}
    </fieldset>
  );
}

export function AiQuotationWizardModal({ project, onClose }: {
  project: ProjectDetail;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [stage, setStage] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [understanding, setUnderstanding] = useState('');
  const [editingUnderstanding, setEditingUnderstanding] = useState(false);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const toast = useToast();
  const reportError = (message: string) => { setError(message); toast.error(message); };
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const extrasFolderUrl = project.documentationLink?.trim() ?? '';
  const [manualFolderUrl, setManualFolderUrl] = useState('');
  // Las carpetas confirmadas sustituyen el enlace de Extras si cambió.
  const [selectedFolderUrl, setSelectedFolderUrl] = useState(extrasFolderUrl);
  const driveFolderUrl = selectedFolderUrl || manualFolderUrl.trim();
  const driveUrlValid = isRealDriveFolderUrl(driveFolderUrl);
  const [authorizationRootUrl, setAuthorizationRootUrl] = useState('');
  const [sourceStep, setSourceStep] = useState<
    'source' | 'connecting' | 'discovering' | 'candidates' | 'loading' | 'documents' | 'analyzing'
  >('source');
  const [discovery, setDiscovery] = useState<EstimationDriveFolderResolution | null>(null);
  const [discoveryChoice, setDiscoveryChoice] = useState('');
  const [preview, setPreview] = useState<DriveBrowseResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerChoice, setPickerChoice] = useState('');
  const [pickerManualUrl, setPickerManualUrl] = useState('');
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [oauthResult, setOauthResult] = useState('');
  const oauthPopup = useRef<Window | null>(null);
  const requestedUrl = useRef('');
  const previewInFlight = useRef(false);
  const accessCheckInFlight = useRef(false);
  const discoveryInFlight = useRef(false);
  const [saveWarning, setSaveWarning] = useState('');
  const [analysisSnapshot, setAnalysisSnapshot] = useState<EstimationPocAnalysis | null>(null);
  const driveStatus = useEstimationDriveOAuthPocStatus();
  const serviceAccountEnabled = driveStatus.data?.serviceAccountEnabled === true;
  const updateProjectExtras = useUpdateProjectExtras();
  const questionnaire = useEstimationQuestionnaireDefinition();
  const analysis = useAnalyzeEstimationPoc();
  const generate = useGenerateAiDemoQuotationVersion(project.id);

  const verifiedAnalysis = analysisSnapshot?.provider === 'gemini' &&
    analysisSnapshot.sourceMode === 'drive' && analysisSnapshot.documentsAnalyzed > 0
    ? analysisSnapshot : null;
  const fixed = questionnaire.data?.fixedQuestions ?? [];
  const dynamic = verifiedAnalysis?.dynamicQuestions ?? [];
  const working = sourceStep === 'connecting' || sourceStep === 'discovering' ||
    sourceStep === 'loading' || sourceStep === 'analyzing' || generate.isPending;
  const relevant = stage === 2 ? fixed : dynamic;

  const loadDocuments = async (folderUrl: string, rootUrl: string): Promise<DriveBrowseResult | null> => {
    if (previewInFlight.current) return null;
    previewInFlight.current = true;
    setSourceStep('loading');
    setError('');
    try {
      const result = await estimationApi.browseDriveFolder({
        projectId: project.id,
        authorizationFolderUrl: rootUrl,
        folderUrl,
      });
      setPreview(result);
      setSelectedFolderUrl(result.folder.url);
      setAuthorizationRootUrl(rootUrl);
      setAnalysisSnapshot(null);
      setSourceStep('documents');
      setPickerOpen(false);
      setPickerError('');
      setOauthResult('');
      oauthPopup.current?.close();
      return result;
    } catch (cause) {
      setSourceStep('source');
      reportError(cause instanceof Error ? cause.message :
        'No se pudieron obtener los documentos. Comprueba los permisos de Drive.');
      return null;
    } finally {
      previewInFlight.current = false;
    }
  };


  /** Guarda sólo carpetas confirmadas y accesibles; permite sustituir Extras. */
  const persistConfirmedFolder = async (url: string) => {
    if (extrasFolderUrl === url) return;
    try {
      await updateProjectExtras.mutateAsync({
        projectId: project.id, input: { documentationLink: url },
      });
      setSaveWarning('');
    } catch {
      setSaveWarning('La carpeta funciona para la cotización, pero no se pudo guardar en Extras. Revisa permisos.');
    }
  };

  const discoverFolders = async () => {
    if (discoveryInFlight.current) return;
    discoveryInFlight.current = true;
    setSourceStep('discovering');
    setError('');
    try {
      const found = await estimationApi.resolveDriveFolder({
        projectId: project.id, projectName: project.name,
        clientName: project.client?.companyName ?? null,
        documentationLink: null, quotationLink: null,
      });
      setDiscovery(found);
      setDiscoveryChoice(found.selectedFolder?.url ?? found.candidates[0]?.url ?? '');
      setSourceStep('candidates');
      oauthPopup.current?.close();
    } catch (cause) {
      setSourceStep('source');
      reportError(cause instanceof Error ? cause.message : 'No fue posible buscar en Drive.');
    } finally {
      discoveryInFlight.current = false;
    }
  };

  const connectAndDiscover = async () => {
    // Para "mi Drive" priorizamos OAuth del usuario, no la cuenta técnica.
    // El service account queda como alternativa si OAuth no está habilitado.
    if (driveStatus.data?.enabled !== true) {
      if (serviceAccountEnabled) { await discoverFolders(); return; }
      reportError('La conexión Google Drive no está habilitada.');
      return;
    }
    const popup = window.open('about:blank', 'kora-drive-auth',
      'width=580,height=730,scrollbars=yes');
    if (!popup) { reportError('Permite ventanas emergentes para autorizar Google Drive.'); return; }
    oauthPopup.current = popup;
    requestedUrl.current = '';
    setSourceStep('connecting');
    setError('');
    setOauthResult('');
    try {
      const access = await estimationApi.driveOAuthPocAccess({ projectId: project.id });
      if (access.authorized) {
        popup.close();
        await discoverFolders();
        return;
      }
      const { authorizationUrl } = await estimationApi.startDriveOAuthPoc({ projectId: project.id });
      if (new URL(authorizationUrl).origin !== 'https://accounts.google.com') {
        throw new Error('La dirección de autorización Google no es válida.');
      }
      popup.location.replace(authorizationUrl);
    } catch (cause) {
      popup.close();
      setSourceStep('source');
      reportError(cause instanceof Error ? cause.message : 'No fue posible conectar Google Drive.');
    }
  };

  const confirmDiscoveredFolder = async () => {
    const url = discoveryChoice || manualFolderUrl.trim();
    if (!isRealDriveFolderUrl(url)) {
      reportError('Selecciona una carpeta o pega una URL válida de Google Drive.');
      return;
    }
    const loaded = await loadDocuments(url, url);
    if (!loaded) setSourceStep('candidates');
    else if (loaded.documents.length > 0) await persistConfirmedFolder(url);
    // Una carpeta vacía o con formatos ilegibles no modifica Extras.
  };

  // Google usa COOP: en algunos navegadores el callback no puede comunicarse
  // mediante window.opener. Comprobamos el estado del servidor sin exigir clics.
  useEffect(() => {
    if (sourceStep !== 'connecting') return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      if (accessCheckInFlight.current || previewInFlight.current || cancelled) return;
      accessCheckInFlight.current = true;
      try {
        const state = await estimationApi.driveOAuthPocAccess({
          projectId: project.id,
          ...(requestedUrl.current ? { driveFolderUrl: requestedUrl.current } : {}),
        });
        if (!cancelled && state.authorized) {
          if (requestedUrl.current) {
            void loadDocuments(requestedUrl.current, requestedUrl.current);
          } else {
            void discoverFolders();
          }
        }
      } catch {
        // El callback OAuth todavía puede estar terminando: reintentar.
      } finally {
        accessCheckInFlight.current = false;
      }
      attempts++;
      if (attempts >= 180 && !cancelled && !previewInFlight.current) {
        setSourceStep('source');
        setError('No se confirmó la autorización de Google. Intenta conectar nuevamente.');
      }
    };
    const timer = window.setInterval(() => void check(), 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [sourceStep, project.id]);

  useEffect(() => {
    const onResult = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== oauthPopup.current) return;
      const raw: unknown = event.data;
      if (!raw || typeof raw !== 'object') return;
      const payload = raw as Record<string, unknown>;
      if (payload.type !== 'kora-drive-oauth-poc' ||
          (payload.status !== 'ok' && payload.status !== 'error')) return;
      if (payload.status === 'ok') {
        if (requestedUrl.current) {
            void loadDocuments(requestedUrl.current, requestedUrl.current);
          } else {
            void discoverFolders();
          }
      } else {
        setSourceStep('source');
        setOauthResult(typeof payload.message === 'string' ? payload.message :
          'Google no autorizó la lectura de Drive.');
        oauthPopup.current?.close();
      }
    };
    window.addEventListener('message', onResult);
    return () => window.removeEventListener('message', onResult);
  });

  const connectAndPreview = async (url: string) => {
    if (!isRealDriveFolderUrl(url)) {
      reportError('Ingresa una URL válida de carpeta de Google Drive.');
      return;
    }
    if (serviceAccountEnabled) {
      await loadDocuments(url, url);
      return;
    }
    if (driveStatus.data?.enabled !== true) {
      reportError('La conexión de Google Drive no está habilitada en este entorno.');
      return;
    }
    // Debe abrirse antes del primer await para que el navegador no lo bloquee.
    const popup = window.open('about:blank', 'kora-drive-auth',
      'width=580,height=730,scrollbars=yes');
    if (!popup) {
      reportError('Permite ventanas emergentes para autorizar Google Drive.');
      return;
    }
    oauthPopup.current = popup;
    requestedUrl.current = url;
    setSourceStep('connecting');
    setError('');
    setOauthResult('');
    try {
      // Reutilizar acceso válido evita presentar Google de nuevo.
      const state = await estimationApi.driveOAuthPocAccess({
        projectId: project.id, driveFolderUrl: url,
      });
      if (state.authorized) {
        popup.close();
        await loadDocuments(url, url);
        return;
      }
      const { authorizationUrl } = await estimationApi.startDriveOAuthPoc({
        projectId: project.id, driveFolderUrl: url,
      });
      if (new URL(authorizationUrl).origin !== 'https://accounts.google.com') {
        throw new Error('La dirección de autorización Google no es válida.');
      }
      popup.location.replace(authorizationUrl);
    } catch (cause) {
      popup.close();
      setSourceStep('source');
      reportError(cause instanceof Error ? cause.message :
        'No se pudo iniciar la autorización de Google Drive.');
    }
  };

  const selectFolder = async () => {
    const url = pickerChoice || pickerManualUrl.trim();
    if (!isRealDriveFolderUrl(url)) {
      setPickerError('Selecciona una carpeta o pega una URL válida de Google Drive.');
      return;
    }
    setPickerBusy(true);
    setPickerError('');
    // Elegir una carpeta que aparece en el explorador aprovecha la autorización
    // original. Un enlace ajeno inicia una autorización propia (no intenta
    // explorar carpetas fuera de la jerarquía validada).
    const candidates = [...(preview?.siblingFolders ?? []), ...(preview?.childFolders ?? [])];
    const related = url === preview?.folder.url ||
      candidates.some((folder) => folder.url === url);
    try {
      setPickerOpen(false);
      if (related && authorizationRootUrl) {
        await loadDocuments(url, authorizationRootUrl);
      } else {
        setSelectedFolderUrl(url);
        setPreview(null);
        setAuthorizationRootUrl('');
        await connectAndPreview(url);
      }
    } finally {
      setPickerBusy(false);
    }
  };

  const answered = (question: EstimationQuestion) => {
    if (assumptions.includes(question.id)) return true;
    const value = answers[question.id];
    if (question.id === 'F02' && typeof value === 'string') {
      if (value.startsWith('Fecha objetivo:')) {
        return /^Fecha objetivo:\s*\d{4}-\d{2}-\d{2}$/.test(value);
      }
      if (value.startsWith('N semanas:')) {
        const match = /^N semanas:\s*(\d+)$/.exec(value);
        return Boolean(match && Number(match[1]) > 0);
      }
    }
    return matchesQuestion(question, value);
  };

  const change = (id: string, value: EstimationAnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setAssumptions((current) => current.filter((key) => key !== id));
    setInvalidId((current) => current === id ? null : current);
    setError('');
  };

  const assume = (id: string) => {
    setAnswers((current) => ({ ...current, [id]: null }));
    setAssumptions((current) => current.includes(id) ? current : [...current, id]);
    setInvalidId(null);
    setError('');
  };

  const collectAnswers = (): SubmitEstimationAnswerInput[] =>
    [...fixed, ...dynamic]
      .filter((question) => assumptions.includes(question.id) || hasValue(answers[question.id]))
      .map((question) => ({
        questionId: question.id,
        value: assumptions.includes(question.id) ? null : answers[question.id] ?? null,
        usedAssumption: assumptions.includes(question.id),
      }));

  const analyze = async () => {
    if (!preview || preview.documents.length === 0 || sourceStep !== 'documents') {
      reportError('Selecciona una carpeta con documentos legibles antes de analizar.');
      return;
    }
    if (extrasFolderUrl !== driveFolderUrl) {
      await persistConfirmedFolder(driveFolderUrl);
    }
    setSourceStep('analyzing');
    setError('');
    setInvalidId(null);
    try {
      const result = await analysis.mutateAsync({
        projectId: project.id,
        projectName: project.name,
        clientName: project.client?.companyName ?? null,
        driveFolderUrl,
        instructions: instructions.trim() || null,
      });
      if (result.provider !== 'gemini' || result.sourceMode !== 'drive' ||
          result.documentsAnalyzed < 1) {
        reportError('Gemini no consiguió analizar documentos reales de la carpeta indicada.');
        return;
      }
      setAnalysisSnapshot(result);
      setUnderstanding(result.summary);
      setEditingUnderstanding(false);
      const prefilled: AnswerState = {};
      for (const question of fixed) {
        const recommendation = result.fixedPrefills?.find((item) =>
          item.questionId === question.id,
        );
        if (question.canPrefill && recommendation &&
            matchesQuestion(question, recommendation.value)) {
          prefilled[question.id] = recommendation.value;
        }
      }
      for (const question of result.dynamicQuestions) {
        if (question.canPrefill && matchesQuestion(question, question.detectedValue)) {
          prefilled[question.id] = question.detectedValue;
        }
      }
      setAnswers(prefilled);
      setAssumptions([]);
      setStage(1);
    } catch (reason) {
      reportError(reason instanceof Error ? reason.message : 'No se pudo analizar la documentación de Drive.');
    } finally {
      setSourceStep('documents');
    }
  };

  const next = async () => {
    setError('');
    if (stage === 0) {
      if (questionnaire.isLoading) return;
      if (questionnaire.isError) {
        reportError('No fue posible cargar las preguntas fijas. Comprueba tu acceso al cuestionario y vuelve a intentarlo.');
        return;
      }
      if (sourceStep === 'source') {
        if (driveUrlValid) await connectAndPreview(driveFolderUrl);
        else await connectAndDiscover();
      } else if (sourceStep === 'candidates') {
        await confirmDiscoveredFolder();
      } else if (sourceStep === 'documents') {
        await analyze();
      }
      return;
    }
    if (stage === 1) {
      if (understanding.trim().length < 20) {
        reportError('Revisa el entendimiento; debe contener al menos 20 caracteres.');
        return;
      }
      setStage(2);
      return;
    }
    if (stage === 2 || stage === 3) {
      const missing = relevant.find((question) => question.required && !answered(question));
      if (missing) {
        setInvalidId(missing.id);
        reportError('Completa la pregunta obligatoria: ' + missing.question);
        return;
      }
      setInvalidId(null);
      setStage(stage + 1);
      return;
    }
    if (stage !== 4 || !verifiedAnalysis || generate.isPending) return;
    try {
      const created = await generate.mutateAsync({
        projectId: project.id,
        projectName: project.name,
        clientName: project.client?.companyName ?? null,
        driveFolderUrl,
        instructions: instructions.trim() || null,
        confirmedUnderstanding: understanding.trim(),
        dynamicQuestions: dynamic,
        answers: collectAnswers(),
      });
      onClose();
      navigate(projectQuotationPath(project) + '?version=' + created.id);
    } catch (reason) {
      reportError(reason instanceof Error ? reason.message :
        'No se pudo generar y guardar la cotización.');
    }
  };

  const back = () => {
    setError('');
    setInvalidId(null);
    setStage((current) => Math.max(0, current - 1));
  };

  return (
    <>
    <Modal open wide className={styles.dialog}
      title="✦ Nueva cotización con el agente IA"
      onClose={onClose}
      dismissible={!working}
      footer={<>
        <Button variant="outline" className={styles.secondaryAction}
          disabled={working && sourceStep !== 'connecting'}
          onClick={stage === 0 ? sourceStep === 'connecting' ? () => {
            oauthPopup.current?.close();
            setSourceStep('source');
          } : onClose :
            stage === 1 ? () => setEditingUnderstanding((current) => !current) : back}>
          {stage === 0 ? 'Cancelar' :
            stage === 1 ? editingUnderstanding ? 'Guardar resumen' : 'Editar' : 'Atrás'}
        </Button>
        <Button className={styles.primaryAction} loading={working} disabled={
          (stage === 0 && (questionnaire.isLoading || driveStatus.isLoading ||
            (sourceStep === 'documents' && !preview?.documents.length) ||
            (sourceStep === 'candidates' &&
              !isRealDriveFolderUrl(discoveryChoice || manualFolderUrl.trim())) ||
            (sourceStep !== 'source' && sourceStep !== 'documents' && sourceStep !== 'candidates'))) ||
          (stage > 0 && !verifiedAnalysis)
        } onClick={() => void next()}>
          {stage === 0 ? sourceStep === 'connecting' ? 'Conectando Google…' :
            sourceStep === 'discovering' ? 'Buscando carpetas…' :
            sourceStep === 'candidates' ? 'Confirmar carpeta' :
            sourceStep === 'loading' ? 'Leyendo documentos…' :
            sourceStep === 'analyzing' ? 'Analizando…' :
            !driveUrlValid && sourceStep === 'source' ? 'Buscar carpeta en Drive' :
            'Analizar proyecto' : stage === 1 ? 'Está correcto' :
            stage === 4 ? 'Generar estimación' : 'Continuar'}
        </Button>
      </>}>
      <nav aria-label="Etapas del asistente de cotización" className={styles.stepper}>
        <ol>{STAGES.map((label, index) => (
          <li key={label} aria-current={index === stage ? 'step' : undefined}
            className={index === stage ? styles.current : index < stage ? styles.done : ''}>
            {index + 1}. {label}
          </li>
        ))}</ol>
      </nav>

      {stage === 0 && (
        <section className={styles.stage}>
          <h3 className={styles.srOnly}>Documentos para el análisis</h3>
          {sourceStep === 'source' && (
            <>
              <p className={styles.intro}>
                El agente analizará los antecedentes reales del proyecto en Google Drive.
              </p>
              {extrasFolderUrl ? (
                <div className={styles.driveSource}>
                  <strong>Carpeta de documentación registrada en Extras</strong>
                  {driveUrlValid ? (
                    <a href={driveFolderUrl} target="_blank" rel="noreferrer">
                      Abrir carpeta en Google Drive
                    </a>
                  ) : (
                    <p role="alert">El enlace de Extras no es una carpeta de Google Drive.
                      Puedes buscar la carpeta correcta y actualizar Extras.</p>
                  )}
                </div>
              ) : (
                <div className={styles.driveSource}>
                  <TextField label="Carpeta de Google Drive del proyecto" type="url"
                    value={manualFolderUrl}
                    onChange={(event) => {
                      setManualFolderUrl(event.target.value);
                      setSelectedFolderUrl('');
                      setError('');
                    }}
                    placeholder="https://drive.google.com/drive/folders/..."
                    helperText="Opcional: pega la URL o busca automáticamente la carpeta en tu Drive." />
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => void connectAndDiscover()}>
                Buscar carpeta de levantamiento en mi Drive
              </Button>
              {oauthResult && <p role="alert" className={styles.error}>{oauthResult}</p>}
            </>
          )}

          {sourceStep === 'discovering' && (
            <div className={styles.connecting} role="status">
              <span className={styles.bigSpinner} aria-hidden="true" />
              <strong>Buscando carpetas de levantamiento</strong>
              <p>Kora coteja proyecto y cliente con carpetas accesibles. No lee
                ni descarga todo tu Drive.</p>
            </div>
          )}
          {sourceStep === 'candidates' && (
            <div className={styles.driveSource}>
              <strong>Carpeta de levantamiento del proyecto</strong>
              <p>{discovery?.selectedFolder
                ? 'Encontramos una coincidencia de alta confianza. Confirma que sea correcta.'
                : discovery?.candidates.length
                  ? 'Hay varias posibilidades. Confirma cuál corresponde al proyecto.'
                  : 'No encontramos una coincidencia clara. Puedes pegar el enlace manualmente.'}</p>
              <div className={styles.discoveryChoices} role="group" aria-label="Carpetas candidatas">
                {discovery?.candidates.map((candidate) => (
                  <label key={candidate.folderId} className={styles.folderPickerItem}>
                    <input type="radio" name="kora-discovery-folder"
                      checked={discoveryChoice === candidate.url}
                      onChange={() => { setDiscoveryChoice(candidate.url); setManualFolderUrl(''); }} />
                    <FolderOpenIcon size={17} />
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.confidence === 'high' ? 'Coincidencia alta' :
                        candidate.confidence === 'medium' ? 'Coincidencia media' : 'Coincidencia baja'}
                        {' · '}{[...candidate.ancestorNames].reverse().join(' / ') || 'Mi Drive'}
                      </small>
                      <small>{candidate.reasons.join(' ')}</small>
                    </span>
                  </label>
                ))}
              </div>
              <TextField label="O pega el enlace de otra carpeta" type="url"
                placeholder="https://drive.google.com/drive/folders/..."
                value={manualFolderUrl}
                onChange={(event) => {
                  setManualFolderUrl(event.target.value);
                  setDiscoveryChoice('');
                  setError('');
                }} />
              <p className={styles.coverageNote}>La carpeta confirmada se guardará en Extras →
                Documentación. Gemini analizará documentos reales de la selección.</p>
            </div>
          )}
          {sourceStep === 'connecting' && (
            <div className={styles.connecting} role="status">
              <span className={styles.bigSpinner} aria-hidden="true" />
              <strong>Conectando con Google Drive</strong>
              <p>Autoriza la lectura en la ventana de Google. Kora continuará
                automáticamente cuando el acceso esté disponible.</p>
            </div>
          )}
          {sourceStep === 'loading' && (
            <ol role="status" className={styles.analysisMilestones}
              aria-label="Preparación de la documentación">
              <li className={styles.milestoneDone}>
                <CheckIcon size={15} /> Carpeta autorizada con Google
              </li>
              <li className={styles.milestoneActive}>
                <span className={styles.milestoneSpinner} aria-hidden="true" />
                Leyendo documentos y preparando las fuentes de análisis…
              </li>
              <li className={styles.milestonePending}>
                <span className={styles.milestoneCircle} /> Analizar el proyecto con Gemini
              </li>
            </ol>
          )}
          {(sourceStep === 'documents' || sourceStep === 'analyzing') && preview && (
            <>
              {sourceStep === 'documents' && (
                <>
                  <p className={styles.intro}>
                    El agente leerá estos documentos antes de hacer preguntas. Usando:
                    {' '}<strong>{preview.folder.name}</strong>
                    {' '}<button type="button" className={styles.changeFolder}
                      onClick={() => {
                        setPickerChoice('');
                        setPickerManualUrl('');
                        setPickerError('');
                        setPickerOpen(true);
                      }}>Cambiar</button>
                  </p>
                  <ul className={styles.documents} aria-label="Documentos que analizará el agente">
                    {preview.documents.map((doc) => (
                      <li key={doc.id}>
                        <FileTextIcon size={14} className={styles.documentIcon} />
                        <span>{doc.name}</span>
                        <span className={styles.docDate}>
                          {doc.modifiedAt ? 'Modificado ' +
                            new Date(doc.modifiedAt).toLocaleDateString('es-CL') : 'Archivo de Drive'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!preview.documents.length && <p role="alert" className={styles.error}>
                    No hay documentos legibles en esta carpeta. Prueba con otra carpeta.
                  </p>}
                  {preview.coverage && (preview.coverage.omitted.length > 0 ||
                    preview.coverage.scanTruncated) && (
                    <p className={styles.coverageNote}>
                      Se seleccionaron {preview.documents.length} de {preview.coverage.eligibleDocuments}
                      {' '}archivos compatibles detectados. Algunos archivos no podrán analizarse.
                    </p>
                  )}
                  <details className={styles.more}>
                    <summary>Indicaciones adicionales · opcional</summary>
                    <label className={styles.textLabel} htmlFor="kora-quotation-instructions">
                      Instrucciones para Gemini
                    </label>
                    <textarea id="kora-quotation-instructions" className={styles.textarea}
                      value={instructions} maxLength={3000}
                      onChange={(event) => setInstructions(event.target.value)}
                      placeholder="Ej. Considerar integración SAP, excluir soporte de postproducción..." />
                  </details>
                </>
              )}
              {sourceStep === 'analyzing' && (
                <ol role="status" className={styles.analysisMilestones}
                  aria-label="Progreso del análisis IA">
                  <li className={styles.milestoneDone}>
                    <CheckIcon size={15} /> Documentación leída: {preview.documents.length} archivos
                  </li>
                  <li className={styles.milestoneDone}>
                    <CheckIcon size={15} /> Datos del proyecto preparados
                  </li>
                  <li className={styles.milestoneActive}>
                    <span className={styles.milestoneSpinner} aria-hidden="true" />
                    Gemini está revisando antecedentes y elaborando el entendimiento…
                  </li>
                  <li className={styles.milestonePending}>
                    <span className={styles.milestoneCircle} />
                    Presentar aclaraciones y resultados
                  </li>
                  <li className={styles.progressNote}>
                    El análisis se realiza en el servidor. Estas etapas muestran operaciones
                    verificables, no porcentajes estimados.
                  </li>
                </ol>
              )}
            </>
          )}
          {saveWarning && <p role="status" className={styles.coverageNote}>{saveWarning}</p>}
          {questionnaire.isLoading && <p>Cargando condiciones de estimación…</p>}
          {questionnaire.isError && <p role="alert">No fue posible cargar las preguntas fijas.</p>}
        </section>
      )}

      {stage === 1 && (
        <section className={styles.stage}>
          <h3 className={styles.srOnly}>Entendimiento del proyecto</h3>
          <p className={styles.intro}>
            Confirma que el agente entendió bien el proyecto. Si algo no calza, corrígelo en bloque.
          </p>
          {editingUnderstanding ? (
            <>
              <label className={styles.textLabel} htmlFor="kora-understanding">
                Resumen editable
              </label>
              <textarea id="kora-understanding" className={styles.understanding}
                value={understanding} maxLength={4000}
                onChange={(event) => setUnderstanding(event.target.value)} />
            </>
          ) : (
            <div className={styles.summaryBox} aria-label="Resumen del proyecto">
              {understanding}
            </div>
          )}
          <p className={styles.source}>
            Fuente analizada: {verifiedAnalysis?.detectedDocuments.join(', ')}
          </p>
        </section>
      )}

      {stage === 2 && (
        <section className={styles.stage}>
          <h3 className={styles.srOnly}>Condiciones de la estimación</h3>
          <p className={styles.intro}>Preguntas base. Las prellenadas se detectaron en el documento; puedes cambiarlas.</p>
          {fixed.map((question) => (
            <QuestionField key={question.id} question={question}
              value={answers[question.id]} assumed={assumptions.includes(question.id)}
              prefillSource={verifiedAnalysis?.fixedPrefills?.find(
                (item) => item.questionId === question.id,
              )?.sourceRefs.map((source) => source.fileName).join(', ')}
              onChange={(value) => change(question.id, value)}
              onAssume={() => assume(question.id)} error={invalidId === question.id} />
          ))}
        </section>
      )}

      {stage === 3 && (
        <section className={styles.stage}>
          <h3 className={styles.srOnly}>Aclaraciones de mayor impacto</h3>
          <p className={styles.intro}>{dynamic.length} aclaraciones de mayor impacto. Lo demás quedó como supuesto.</p>
          {dynamic.length === 0 ? (
            <p className={styles.summaryBox}>Gemini no detectó aclaraciones adicionales de impacto.</p>
          ) : dynamic.map((question, index) => (
            <div key={question.id} className={styles.dynamic}>
              <QuestionField question={{ ...question, category: 'Aclaración ' + (index + 1) + ' de ' + dynamic.length + ' · ' + question.category }} value={answers[question.id]}
                assumed={assumptions.includes(question.id)}
                onChange={(value) => change(question.id, value)}
                onAssume={() => assume(question.id)} error={invalidId === question.id} />
            </div>
          ))}
        </section>
      )}

      {stage === 4 && (
        <section className={styles.stage}>
          <h3 className={styles.srOnly}>Confirmar la estimación</h3>
          <p className={styles.intro}>Revisa las respuestas y los supuestos antes de generar la propuesta y EDT.</p>
          <div className={styles.review}>
            <details className={styles.more}>
              <summary>Ver entendimiento confirmado</summary>
              <p className={styles.summary}>{understanding}</p>
            </details>
            <dl>{[...fixed, ...dynamic].map((question) => (
              <div key={question.id}>
                <dt>{question.category} · {question.question}</dt>
                <dd>{assumptions.includes(question.id)
                  ? 'Se deja como supuesto: ' + question.assumptionIfSkipped
                  : displayAnswer(question, answers[question.id])}</dd>
              </div>
            ))}</dl>
            <h4>Supuestos adoptados</h4>
            {assumptions.length ? <ul>{[...fixed, ...dynamic]
              .filter((question) => assumptions.includes(question.id))
              .map((question) => <li key={question.id}>{question.assumptionIfSkipped}</li>)}</ul>
              : <p>No se han adoptado supuestos por respuestas omitidas.</p>}
            <h4>Pendientes</h4>
            {assumptions.length > 0 &&
              <ul>{dynamic.filter((question) => assumptions.includes(question.id))
                .map((question) => <li key={question.id}>Confirmar: {question.question}</li>)}</ul>}
            <p>Validar con el cliente los resultados de esta estimación basada en Drive,
              antes de utilizarla en un proyecto real.</p>
          </div>
          <p className={styles.warning}>La cotización se guardará como borrador
            con revisión IA pendiente. No se enviará ni aprobará automáticamente.</p>
        </section>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Modal>
    {pickerOpen && preview && (
      <Modal open wide title="Elegir carpeta del proyecto"
        className={styles.folderPicker}
        onClose={() => setPickerOpen(false)}
        footer={<>
          <Button variant="outline" disabled={pickerBusy}
            onClick={() => setPickerOpen(false)}>Cancelar</Button>
          <Button className={styles.primaryAction} loading={pickerBusy}
            disabled={!pickerChoice && !isRealDriveFolderUrl(pickerManualUrl)}
            onClick={() => void selectFolder()}>Confirmar carpeta</Button>
        </>}>
        <p className={styles.intro}>Selecciona otra carpeta accesible o pega su enlace.</p>
        <div className={styles.folderPickerList}>
          {preview.siblingFolders.length > 0 && <h3>Carpetas de la misma ubicación</h3>}
          {preview.siblingFolders.map((folder: DriveBrowseFolder) => (
            <label key={'sibling-' + folder.id} className={styles.folderPickerItem}>
              <input type="radio" name="kora-drive-folder"
                checked={pickerChoice === folder.url}
                onChange={() => { setPickerChoice(folder.url); setPickerManualUrl(''); }} />
              <FolderOpenIcon size={17} />
              <span><strong>{folder.name}</strong><small>Carpeta accesible</small></span>
            </label>
          ))}
          {preview.childFolders.length > 0 && <h3>Subcarpetas</h3>}
          {preview.childFolders.map((folder: DriveBrowseFolder) => (
            <label key={'child-' + folder.id} className={styles.folderPickerItem}>
              <input type="radio" name="kora-drive-folder"
                checked={pickerChoice === folder.url}
                onChange={() => { setPickerChoice(folder.url); setPickerManualUrl(''); }} />
              <FolderOpenIcon size={17} />
              <span><strong>{folder.name}</strong><small>Dentro de {preview.folder.name}</small></span>
            </label>
          ))}
          {!preview.siblingFolders.length && !preview.childFolders.length && (
            <p className={styles.coverageNote}>No se encontraron carpetas alternativas accesibles
              en esta ubicación. Puedes ingresar un enlace manualmente.</p>
          )}
          {preview.siblingsUnavailable && (
            <p className={styles.coverageNote}>Google no permite consultar la carpeta superior.
              Solo se muestran subcarpetas accesibles.</p>
          )}
        </div>
        <TextField label="O pega el enlace de otra carpeta" type="url"
          value={pickerManualUrl} placeholder="https://drive.google.com/drive/folders/..."
          onChange={(event) => {
            setPickerManualUrl(event.target.value);
            setPickerChoice('');
            setPickerError('');
          }} />
        {pickerError && <p role="alert" className={styles.error}>{pickerError}</p>}
      </Modal>
    )}
    </>
  );
}
