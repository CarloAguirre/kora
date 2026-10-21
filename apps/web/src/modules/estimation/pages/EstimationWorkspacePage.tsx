import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type {
  EstimationCreationMode,
  EstimationPocRole,
  SubmitEstimationAnswerInput,
} from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import {
  useAnalyzeEstimationPoc,
  useGenerateEstimationPocProposal,
} from '../api/estimation.queries';
import { EstimationQuestionnaireForm } from '../components/EstimationQuestionnaireForm';
import { useEstimationWorkspace } from '../hooks/useEstimationWorkspace';
import { getManualEstimationTemplate } from '../lib/estimation-templates';
import styles from './EstimationWorkspacePage.module.css';

interface EstimationNavigationState {
  creationMode?: EstimationCreationMode;
  driveFolderUrl?: string;
  instructions?: string;
}

const PIPELINE = [
  'Antecedentes de Drive',
  'Aclaraciones mínimas',
  'Documentación base',
  'EDT',
  'Estimación final',
] as const;

const ANALYSIS_STEPS = [
  'Leyendo antecedentes del levantamiento',
  'Identificando requerimientos, procesos e integraciones',
  'Detectando vacíos que sí cambian la estimación',
  'Preparando preguntas de aclaración',
] as const;

const formatHours = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

function RolesTable({ roles }: { roles: readonly EstimationPocRole[] }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.rolesTable}>
        <thead>
          <tr>
            <th>Rol</th>
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
                {role.source && <span className={styles.source}>✦ {role.source}</span>}
              </td>
              <td>{role.unit === 'week' ? 'Semana' : 'Día'}</td>
              <td className={styles.numeric}>{role.duration}</td>
              <td className={styles.numeric}>{role.hoursPerUnit}</td>
              <td className={styles.numeric}>{role.people}</td>
              <td className={styles.numeric}><strong>{formatHours(role.totalHours)}</strong></td>
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
  const [searchParams] = useSearchParams();
  const navigationState = (location.state ?? {}) as EstimationNavigationState;
  const modeParam = searchParams.get('mode');
  const mode: EstimationCreationMode = isCreationMode(modeParam)
    ? modeParam
    : navigationState.creationMode ?? 'standard';

  const { project, questionnaire, isLoading } = useEstimationWorkspace(projectId ?? null);
  const analyze = useAnalyzeEstimationPoc();
  const generateProposal = useGenerateEstimationPocProposal();
  const analysisStarted = useRef<string | null>(null);

  const driveFolderUrl =
    navigationState.driveFolderUrl?.trim() ||
    (project.data?.documentationLink?.includes('drive.google.com')
      ? project.data.documentationLink
      : '');
  const instructions = navigationState.instructions?.trim() || '';

  const manualRoles = useMemo(
    () => (mode === 'ai' ? [] : getManualEstimationTemplate(mode)),
    [mode],
  );

  useEffect(() => {
    if (mode !== 'ai' || !project.data || !driveFolderUrl) return;
    const analysisKey = `${project.data.id}::${driveFolderUrl}::${instructions}`;
    if (analysisStarted.current === analysisKey) return;
    analysisStarted.current = analysisKey;
    analyze.mutate({
      projectId: project.data.id,
      projectName: project.data.name,
      clientName: project.data.client?.companyName ?? null,
      driveFolderUrl,
      instructions: instructions || null,
    });
  }, [analyze, driveFolderUrl, instructions, mode, project.data]);

  if (!projectId) {
    return (
      <DashboardLayout title="Calculadora">
        <Card>No se indicó un prospecto para estimar.</Card>
      </DashboardLayout>
    );
  }

  const proposal = generateProposal.data;
  const analysis = analyze.data;
  const roles = proposal?.roles ?? manualRoles;
  const totalHours = proposal?.totalHours ?? manualRoles.reduce((sum, role) => sum + role.totalHours, 0);

  const submitQuestionnaire = (answers: SubmitEstimationAnswerInput[]) => {
    if (!project.data || !driveFolderUrl) return;
    generateProposal.mutate({
      projectId: project.data.id,
      projectName: project.data.name,
      clientName: project.data.client?.companyName ?? null,
      driveFolderUrl,
      instructions: instructions || null,
      answers,
    });
  };

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
              {mode === 'ai' ? 'Estimación con agente IA' : mode === 'rpa' ? 'Plantilla RPA' : 'Plantilla estándar'}
            </span>
            <h1>{project.data?.name ?? 'Prospecto'}</h1>
            <p>
              {mode === 'ai'
                ? 'Primero se analizan los antecedentes, luego se responden únicamente las aclaraciones necesarias y recién después se genera la estimación.'
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
        {!isLoading && project.error && <Card>No se pudo cargar el prospecto seleccionado.</Card>}

        {!isLoading && project.data && (
          <div className={styles.editorGrid}>
            <div className={styles.editorMain}>
              <Card className={styles.projectCard}>
                <div className={styles.projectMetaGrid}>
                  <div>
                    <span>Cliente</span>
                    <strong>{project.data.client?.companyName ?? 'Cliente por confirmar'}</strong>
                  </div>
                  <div>
                    <span>Prospecto</span>
                    <strong>{project.data.name}</strong>
                  </div>
                  <div>
                    <span>Origen</span>
                    <strong>{mode === 'ai' ? 'Agente IA' : mode === 'rpa' ? 'Plantilla RPA' : 'Plantilla estándar'}</strong>
                  </div>
                </div>
                <p className={styles.metaNote}>
                  Cliente, nombre y estado comercial siguen siendo responsabilidad del módulo Proyectos.
                </p>
                {mode === 'ai' && (
                  <p className={styles.driveNote}>
                    📁 {driveFolderUrl ? 'Carpeta de Drive vinculada para el análisis.' : 'No hay carpeta de Drive vinculada.'}
                  </p>
                )}
              </Card>

              {mode === 'ai' && !driveFolderUrl && (
                <Card className={styles.errorCard}>
                  <h2>Falta la carpeta de Drive</h2>
                  <p>
                    Vuelve a <Link to="/calculadora">Calculadora</Link> y crea la estimación desde
                    <strong> + Nueva estimación</strong> indicando la carpeta del levantamiento.
                  </p>
                </Card>
              )}

              {mode === 'ai' && driveFolderUrl && analyze.isPending && (
                <Card className={styles.analysisCard}>
                  <span className={styles.agentEyebrow}>✦ Agente IA</span>
                  <h2>Analizando antecedentes</h2>
                  <p className={styles.summaryText}>
                    Esta PoC simula el análisis. La integración real con Drive reemplazará este adaptador
                    sin cambiar el flujo de la pantalla.
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

              {mode === 'ai' && analyze.error && (
                <Card className={styles.errorCard}>
                  <h2>No se pudo analizar el levantamiento</h2>
                  <p>Revisa la API de Kora y vuelve a iniciar la estimación.</p>
                </Card>
              )}

              {mode === 'ai' && analysis && !proposal && questionnaire.data && (
                <>
                  <Card className={styles.analysisSummary}>
                    <span className={styles.agentEyebrow}>Entendimiento preliminar</span>
                    <h2>El análisis terminó antes de estimar</h2>
                    <p>{analysis.summary}</p>
                    <div className={styles.analysisMeta}>
                      <span>{analysis.documentsAnalyzed} documentos analizados</span>
                      <span>{analysis.dynamicQuestions.length} aclaraciones dinámicas</span>
                    </div>
                  </Card>

                  <Card>
                    <EstimationQuestionnaireForm
                      fixedQuestions={questionnaire.data.fixedQuestions}
                      dynamicQuestions={analysis.dynamicQuestions}
                      submitting={generateProposal.isPending}
                      onSubmit={submitQuestionnaire}
                    />
                  </Card>
                </>
              )}

              {mode === 'ai' && questionnaire.error && (
                <Card>No se pudo cargar la definición del cuestionario.</Card>
              )}

              {generateProposal.error && (
                <Card className={styles.errorCard}>
                  <h2>No se pudo generar la estimación final</h2>
                  <p>Las respuestas se conservarán en la futura versión persistida del flujo.</p>
                </Card>
              )}

              {(mode !== 'ai' || proposal) && (
                <Card className={styles.rolesCard}>
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={mode === 'ai' ? styles.agentEyebrow : styles.eyebrow}>
                        {mode === 'ai' ? '✦ Propuesta IA' : 'Base editable'}
                      </span>
                      <h2>Roles y dedicación</h2>
                    </div>
                    {mode === 'ai' && <span className={styles.reviewBadge}>Por revisar</span>}
                  </div>
                  {proposal && <p className={styles.summaryText}>{proposal.summary}</p>}
                  <RolesTable roles={roles} />
                  {mode !== 'ai' && (
                    <p className={styles.metaNote}>
                      En la siguiente iteración estas celdas serán editables, igual que en el prototipo HTML.
                    </p>
                  )}
                </Card>
              )}

              {proposal && (
                <Card className={styles.documentsCard}>
                  <span className={styles.eyebrow}>Siguiente salida</span>
                  <h2>Documentación base + EDT</h2>
                  <p>
                    El flujo ya termina la estimación después del cuestionario. El próximo vertical slice
                    generará los documentos normalizados y los escribirá en la misma carpeta de Drive antes
                    de producir la EDT definitiva.
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
                  <strong>{mode === 'ai' ? 'Agente IA' : mode === 'rpa' ? 'Plantilla RPA' : 'Plantilla estándar'}</strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span>Estado</span>
                  <strong>
                    {proposal
                      ? 'Estimación generada'
                      : mode === 'ai'
                        ? analysis
                          ? 'Esperando respuestas'
                          : 'Analizando'
                        : 'Borrador manual'}
                  </strong>
                </div>

                {proposal && (
                  <>
                    <div className={styles.divider} />
                    <h3>Supuestos</h3>
                    <ul>
                      {proposal.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
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
