import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  EstimationCreationMode,
  EstimationPocRole,
  SubmitEstimationAnswerInput,
} from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { projectQuotationPath } from '@/app/router/paths';
import { Card } from '@/shared/components/ui/Card';
import { useEstimationDocumentAnalysis, useEstimationQuestionnaireDefinition, useGenerateAnsweredEstimationPocProposal } from '../api/estimation.queries';
import { EstimationQuestionnaireForm } from '../components/EstimationQuestionnaireForm';
import { useGenerateAiDemoQuotationVersion } from '../api/quotation.queries';
import { DEMO_KDM_FOLDER_URL } from '../lib/demo-source';
import { useEstimationWorkspace } from '../hooks/useEstimationWorkspace';
import { getManualEstimationTemplate } from '../lib/estimation-templates';
import styles from './EstimationWorkspacePage.module.css';

interface EstimationNavigationState {
  creationMode?: EstimationCreationMode;
  driveFolderUrl?: string;
  instructions?: string;
}

const PIPELINE = [
  'Análisis',
  'Entendimiento',
  'Condiciones',
  'Aclaraciones',
  'Confirmación',
] as const;

const ANALYSIS_STEPS = [
  'Leyendo documentos relevantes de la carpeta de levantamiento',
  'Identificando procesos, integraciones y alcance',
  'Estimando roles, duración y dedicación',
  'Redactando supuestos y exclusiones',
] as const;

const formatHours = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

function RolesTable({ roles }: { roles: readonly EstimationPocRole[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.rolesTable}>
        <thead>
          <tr>
            <th>Rol / equipo</th>
            <th>Unidad</th>
            <th className={styles.numeric}>Duración</th>
            <th className={styles.numeric}>HH / unidad</th>
            <th className={styles.numeric}>Personas</th>
            <th className={styles.numeric}>HH</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.role}>
              <td>
                <strong>{role.role}</strong>
                {role.source && (
                  <span className={styles.source}>✦ {role.source}</span>
                )}
              </td>
              <td>{role.unit === 'week' ? 'Semana' : 'Día'}</td>
              <td className={styles.numeric}>{role.duration}</td>
              <td className={styles.numeric}>{role.hoursPerUnit}</td>
              <td className={styles.numeric}>{role.people}</td>
              <td className={styles.numeric}>
                <strong>{formatHours(role.totalHours)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isCreationMode(value: string | null): value is EstimationCreationMode {
  return value === 'ai' || value === 'standard' || value === 'rpa';
}

export function EstimationWorkspacePage() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navigationState = (location.state ?? {}) as EstimationNavigationState;
  const modeParam = searchParams.get('mode');
  const mode: EstimationCreationMode = isCreationMode(modeParam)
    ? modeParam
    : navigationState.creationMode ?? 'standard';

  const { project, isLoading } = useEstimationWorkspace(projectId ?? null);
  const demoMode = searchParams.get('demo') === 'kdm';
  const generateProposal = useGenerateAnsweredEstimationPocProposal();
  const generateDemo = useGenerateAiDemoQuotationVersion(projectId ?? '');
  const generating = demoMode ? generateDemo.isPending : generateProposal.isPending;
  const questionnaire = useEstimationQuestionnaireDefinition(mode === 'ai');

  const driveFolderUrl =
    (demoMode ? DEMO_KDM_FOLDER_URL : navigationState.driveFolderUrl?.trim()) ||
    (project.data?.documentationLink?.includes('drive.google.com')
      ? project.data.documentationLink
      : '');
  const instructions = navigationState.instructions?.trim() || '';
  const analysis = useEstimationDocumentAnalysis(
    project.data && demoMode ? {
      projectId: project.data.id,
      projectName: project.data.name,
      clientName: project.data.client?.companyName ?? null,
      driveFolderUrl: DEMO_KDM_FOLDER_URL,
      instructions: instructions || null,
    } : null,
    demoMode && mode === 'ai' && Boolean(project.data),
  );
  const dynamicQuestions = demoMode && analysis.data?.provider === 'gemini'
    ? analysis.data.dynamicQuestions : [];

  const manualRoles = useMemo(
    () => (mode === 'ai' ? [] : getManualEstimationTemplate(mode)),
    [mode],
  );

  const submitQuestionnaire = (answers: SubmitEstimationAnswerInput[]) => {
    if (mode !== 'ai' || !project.data || !driveFolderUrl || generating) return;
    const input = {
      projectId: project.data.id,
      projectName: project.data.name,
      clientName: project.data.client?.companyName ?? null,
      driveFolderUrl: demoMode ? DEMO_KDM_FOLDER_URL : driveFolderUrl,
      instructions: instructions || null,
      answers,
    };
    if (demoMode) {
      // En una sola solicitud el servidor valida, llama a Gemini con KDM y
      // persiste una versión IA. Ninguna propuesta creada solo en el navegador.
      generateDemo.mutate({ ...input, dynamicQuestions }, {
        onSuccess: (created) => navigate(projectQuotationPath(project.data) +
          '?version=' + created.id + '&map-ai=1'),
      });
    } else {
      generateProposal.mutate(input);
    }
  };

  if (!projectId) {
    return (
      <DashboardLayout title="Calculadora">
        <Card>No se indicó un prospecto para estimar.</Card>
      </DashboardLayout>
    );
  }

  const proposal = mode === 'ai' && !demoMode && generateProposal.data?.projectId === project.data?.id
    ? generateProposal.data : undefined;
  const roles = proposal?.roles ?? manualRoles;
  const totalHours =
    proposal?.totalHours ??
    manualRoles.reduce((sum, role) => sum + role.totalHours, 0);

  return (
    <DashboardLayout title="Calculadora">
      <div className={styles.page}>
        <div className={styles.breadcrumb}>
          <Link to="/calculadora">Calculadora</Link>
          <span>/</span>
          <span>{project.data?.client?.companyName ?? 'Cliente'}</span>
          <span>/</span>
          <strong>{project.data?.name ?? 'Prospecto'}</strong>
        </div>

        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>
              {mode === 'ai'
                ? 'Estimación con agente IA'
                : mode === 'rpa'
                  ? 'Plantilla RPA'
                  : 'Plantilla estándar'}
            </span>
            <h1>{project.data?.name ?? 'Prospecto'}</h1>
            <p>
              {mode === 'ai'
                ? demoMode
                  ? 'Gemini analizará el PDF KDM de demostración, planteará aclaraciones y guardará un borrador de cotización en Kora.'
                  : 'Confirma el cuestionario F01–F05 antes de generar la estimación. La lectura de Drive depende de la configuración del proveedor.'
                : 'La estimación parte desde una plantilla de roles y dedicaciones, tal como en el flujo original de Calculadora.'}
            </p>
          </div>
          <span className={styles.status}>PoC</span>
        </div>

        <Card className={styles.pipelineCard}>
          <h2>Flujo de estimación</h2>
          <div className={styles.pipeline}>
            {PIPELINE.map((step, index) => (
              <div key={step} className={styles.pipelineStep}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </Card>

        {isLoading && <Card>Cargando prospecto…</Card>}
        {!isLoading && project.error && (
          <Card>No se pudo cargar el prospecto seleccionado.</Card>
        )}

        {!isLoading && project.data && (
          <div className={styles.editorGrid}>
            <div className={styles.editorMain}>
              <Card className={styles.projectCard}>
                <div className={styles.projectMetaGrid}>
                  <div>
                    <span>Cliente</span>
                    <strong>
                      {project.data.client?.companyName ??
                        'Cliente por confirmar'}
                    </strong>
                  </div>
                  <div>
                    <span>Prospecto</span>
                    <strong>{project.data.name}</strong>
                  </div>
                  <div>
                    <span>Origen</span>
                    <strong>
                      {mode === 'ai'
                        ? 'Agente IA'
                        : mode === 'rpa'
                          ? 'Plantilla RPA'
                          : 'Plantilla estándar'}
                    </strong>
                  </div>
                </div>
                {mode === 'ai' && (
                  <p className={styles.driveNote}>
                    📁{' '}
                    {demoMode ? 'Fuente de demostración: Requerimiento_KDM.pdf (sin conexión Drive real).'
                      : driveFolderUrl
                      ? 'Carpeta de Drive vinculada como raíz del análisis.'
                      : 'No hay carpeta de Drive vinculada.'}
                  </p>
                )}
              </Card>

              {mode === 'ai' && !driveFolderUrl && (
                <Card className={styles.errorCard}>
                  <h2>Falta la carpeta de Drive</h2>
                  <p>
                    Vuelve a <Link to="/calculadora">Calculadora</Link> y crea
                    la estimación desde <strong>+ Nueva estimación</strong>{' '}
                    indicando la carpeta raíz del proyecto.
                  </p>
                </Card>
              )}

              {demoMode && mode === 'ai' && analysis.isLoading && (
                <Card className={styles.analysisCard}>
                  <h2>Analizando el documento KDM con Gemini…</h2>
                  <p>Se identifican procesos e incertidumbres antes de formular las aclaraciones.</p>
                </Card>
              )}

              {demoMode && mode === 'ai' && analysis.isError && (
                <Card className={styles.errorCard}>
                  <h2>No se pudo analizar el ejemplo KDM</h2>
                  <p>{analysis.error instanceof Error
                    ? analysis.error.message
                    : 'Comprueba GEMINI_API_KEY y vuelve a cargar.'}</p>
                </Card>
              )}

              {demoMode && mode === 'ai' && analysis.data?.provider !== 'gemini' &&
                !analysis.isLoading && !analysis.isError && (
                  <Card className={styles.errorCard}>
                    <p>El modo KDM requiere Gemini real; no continúa con resultados simulados del proveedor PoC.</p>
                  </Card>
                )}

              {demoMode && analysis.data?.provider === 'gemini' && (
                <Card className={styles.analysisCard}>
                  <span className={styles.eyebrow}>Análisis documental · fuente KDM de prueba</span>
                  <h2>Entendimiento preliminar</h2>
                  <p>{analysis.data.summary}</p>
                  <p className={styles.metaNote}>
                    {analysis.data.documentsAnalyzed} documento(s) de demostración ·
                    {' '}{dynamicQuestions.length} pregunta(s) dinámica(s) propuestas por Gemini.
                  </p>
                </Card>
              )}

              {mode === 'ai' && driveFolderUrl && questionnaire.isLoading && (
                <Card className={styles.analysisCard}>
                  <h2>Cargando preguntas de estimación…</h2>
                </Card>
              )}

              {mode === 'ai' && driveFolderUrl && questionnaire.isError && (
                <Card className={styles.errorCard}>
                  <h2>No se pudo cargar el cuestionario</h2>
                  <p>No está disponible la definición F01–F05 para esta sesión.
                    Revisa tu acceso y vuelve a cargar la página.</p>
                </Card>
              )}

              {mode === 'ai' && driveFolderUrl && project.data &&
                questionnaire.data && !proposal && (!demoMode || analysis.data?.provider === 'gemini') && (
                  <Card className={styles.analysisCard}>
                    <p className={styles.metaNote}>
                      Confirma F01–F05 antes de generar la propuesta Gemini.
                      {demoMode
                        ? ' Fuente de demostración: PDF KDM; Gemini genera preguntas dinámicas justificadas por ese archivo.'
                        : ' Las preguntas dinámicas requieren analizar la documentación real.'}
                    </p>
                    <EstimationQuestionnaireForm
                      key={project.data.id + ':' + driveFolderUrl}
                      fixedQuestions={questionnaire.data.fixedQuestions}
                      dynamicQuestions={dynamicQuestions}
                      submitting={generating}
                      onSubmit={submitQuestionnaire}
                    />
                  </Card>
                )}

              {mode === 'ai' &&
                driveFolderUrl &&
                generating && (
                  <Card className={styles.analysisCard}>
                    <span className={styles.agentEyebrow}>✦ Agente IA</span>
                    <h2>El agente está preparando la propuesta</h2>
                    <p className={styles.summaryText}>
                      Gemini procesa las respuestas y el PDF KDM de prueba.
                      Después guarda el borrador de cotización en PostgreSQL. No se consulta el Drive del proyecto.
                    </p>
                    <ol className={styles.analysisSteps}>
                      {ANALYSIS_STEPS.map((step, index) => (
                        <li key={step}>
                          <span>{index + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}

              {mode === 'ai' && (demoMode ? generateDemo.error : generateProposal.error) && (
                <Card className={styles.errorCard}>
                  <h2>No se pudo generar la propuesta</h2>
                  <p>
                    {(demoMode ? generateDemo.error : generateProposal.error) instanceof Error
                      ? (demoMode ? generateDemo.error : generateProposal.error)?.message
                      : 'Revisa la configuración de Google Drive y del proveedor IA.'}
                  </p>
                </Card>
              )}

              {(mode !== 'ai' || proposal) && (
                <Card className={styles.rolesCard}>
                  <div className={styles.sectionHead}>
                    <div>
                      <span
                        className={
                          mode === 'ai'
                            ? styles.agentEyebrow
                            : styles.eyebrow
                        }
                      >
                        {mode === 'ai' ? '✦ Propuesta IA' : 'Base editable'}
                      </span>
                      <h2>Roles y dedicación</h2>
                    </div>
                    {mode === 'ai' && (
                      <span className={styles.reviewBadge}>Por revisar</span>
                    )}
                  </div>

                  {proposal && (
                    <>
                      <p className={styles.summaryText}>
                        {proposal.summary}
                      </p>
                      <div className={styles.analysisMeta}>
                        <span>
                          {proposal.documentsAnalyzed} documentos {proposal.sourceMode === 'poc_simulated'
                            ? 'de demostración (no fuentes reales del proyecto)' : 'procesados desde Drive'}
                        </span>
                        <span>
                          Proveedor:{' '}
                          {proposal.provider === 'gemini'
                            ? 'Gemini'
                            : 'PoC simulado'}
                        </span>
                      </div>
                    </>
                  )}

                  <RolesTable roles={roles} />

                  {mode !== 'ai' && (
                    <p className={styles.metaNote}>
                      En una iteración posterior estas celdas podrán editarse,
                      igual que en el prototipo HTML.
                    </p>
                  )}
                </Card>
              )}

              {proposal && (
                <Card className={styles.documentsCard}>
                  <span className={styles.eyebrow}>Alcance de esta PoC</span>
                  <h2>Estimación ejecutiva por equipos</h2>
                  <p>
                    Esta PoC estima roles, duración, dedicación, HH y supuestos
                    utilizando las respuestas del cuestionario. No genera todavía
                    requerimientos, historias de usuario, tareas ni EDT granular.
                    Las preguntas dinámicas documentales siguen pendientes.
                  </p>
                </Card>
              )}
            </div>

            <aside className={styles.summaryColumn}>
              <Card className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total estimado</span>
                <div className={styles.totalHours}>
                  {roles.length ? formatHours(totalHours) : '—'}
                  <small> HH</small>
                </div>

                <div className={styles.summaryBlock}>
                  <span>Origen</span>
                  <strong>
                    {mode === 'ai'
                      ? proposal?.sourceMode === 'poc_simulated'
                        ? 'Demostración PoC (sin Drive real)'
                        : proposal?.provider === 'gemini'
                          ? 'Agente IA · Gemini + Drive'
                          : 'Pendiente de análisis'
                      : mode === 'rpa'
                        ? 'Plantilla RPA'
                        : 'Plantilla estándar'}
                  </strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span>Estado</span>
                  <strong>
                    {proposal
                      ? 'Propuesta lista para revisar'
                      : mode === 'ai'
                        ? generating
                          ? 'Analizando antecedentes'
                          : 'Esperando análisis'
                        : 'Borrador manual'}
                  </strong>
                </div>

                {proposal && (
                  <>
                    <div className={styles.divider} />
                    <h3>Supuestos</h3>
                    {proposal.assumptions.length > 0 ? (
                      <ul>
                        {proposal.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.summaryText}>
                        Sin supuestos adicionales declarados.
                      </p>
                    )}
                  </>
                )}
              </Card>
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
