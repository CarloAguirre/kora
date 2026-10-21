import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EstimationPocProposal } from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { useGenerateEstimationPocProposal } from '../api/estimation.queries';
import { useEstimationWorkspace } from '../hooks/useEstimationWorkspace';
import { QuestionnaireBlueprintCard } from '../components/QuestionnaireBlueprintCard';
import styles from './EstimationWorkspacePage.module.css';

const PIPELINE = [
  'Antecedentes de Drive',
  'Contexto normalizado',
  'Aclaraciones mínimas',
  'EDT',
  'Resumen y escenarios',
] as const;

const formatHours = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

function RoleTable({ proposal }: { proposal: EstimationPocProposal }) {
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
          {proposal.roles.map((role) => (
            <tr key={role.role}>
              <td>
                <strong>{role.role}</strong>
                {role.source && <span className={styles.source}>{role.source}</span>}
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

export function EstimationWorkspacePage() {
  const { projectId } = useParams();
  const { project, questionnaire, isLoading } = useEstimationWorkspace(projectId ?? null);
  const generateProposal = useGenerateEstimationPocProposal();
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [driveTouched, setDriveTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (driveTouched || !project.data?.documentationLink) return;
    if (!project.data.documentationLink.includes('drive.google.com')) return;
    setDriveFolderUrl(project.data.documentationLink);
  }, [driveTouched, project.data?.documentationLink]);

  const proposal = generateProposal.data;
  const projectLabel = useMemo(() => {
    if (!project.data) return 'Proyecto';
    const client = project.data.client?.companyName;
    return client ? `${client} · ${project.data.name}` : project.data.name;
  }, [project.data]);

  if (!projectId) {
    return (
      <DashboardLayout title="Calculadora">
        <Card>No se indicó un proyecto para estimar.</Card>
      </DashboardLayout>
    );
  }

  const onGenerate = async () => {
    if (!project.data) return;
    if (!driveFolderUrl.trim()) {
      setLocalError('Vincula la carpeta de Drive del levantamiento para continuar.');
      return;
    }
    setLocalError(null);
    await generateProposal.mutateAsync({
      projectId: project.data.id,
      projectName: project.data.name,
      clientName: project.data.client?.companyName ?? null,
      driveFolderUrl: driveFolderUrl.trim(),
      instructions: instructions.trim() || null,
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
          <strong>{project.data?.name ?? 'Proyecto'}</strong>
        </div>

        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Estimación asistida por IA</span>
            <h1>{project.data?.name ?? 'Proyecto'}</h1>
            <p>
              Las HH se calculan de forma determinística a partir de la propuesta estructurada del
              módulo IA. La lectura real de Drive se incorporará en el siguiente vertical slice.
            </p>
          </div>
          <span className={styles.status}>PoC</span>
        </div>

        <Card className={styles.pipelineCard}>
          <h2>Flujo objetivo</h2>
          <div className={styles.pipeline}>
            {PIPELINE.map((step, index) => (
              <div key={step} className={styles.pipelineStep}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </Card>

        {isLoading && <Card>Cargando proyecto y configuración…</Card>}

        {!isLoading && project.error && (
          <Card>No se pudo cargar el proyecto seleccionado.</Card>
        )}

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
                    <span>Proyecto</span>
                    <strong>{project.data.name}</strong>
                  </div>
                  <div>
                    <span>HH actuales</span>
                    <strong>{formatHours(project.data.soldHours)} HH</strong>
                  </div>
                </div>
                <p className={styles.metaNote}>
                  Cliente, nombre, etapa y responsables siguen viniendo del módulo Proyectos.
                </p>
              </Card>

              <Card className={styles.agentCard}>
                <div className={styles.sectionHead}>
                  <div>
                    <span className={styles.agentEyebrow}>✦ Agente IA</span>
                    <h2>Generar propuesta</h2>
                  </div>
                  <span className={styles.simBadge}>Proveedor simulado</span>
                </div>

                <TextField
                  label="Carpeta de Drive del levantamiento"
                  type="url"
                  value={driveFolderUrl}
                  onChange={(event) => {
                    setDriveTouched(true);
                    setDriveFolderUrl(event.target.value);
                    setLocalError(null);
                  }}
                  placeholder="https://drive.google.com/drive/folders/…"
                  helperText="En la PoC validamos el flujo y el contrato. Todavía no se descargan documentos."
                  errorText={localError ?? undefined}
                />

                <label className={styles.textareaField}>
                  <span>Indicaciones para el agente (opcional)</span>
                  <textarea
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Ej. Considerar solo el módulo de despacho; el cliente ya tiene las licencias."
                  />
                </label>

                <div className={styles.agentActions}>
                  <Button
                    onClick={() => void onGenerate()}
                    loading={generateProposal.isPending}
                    loadingText="Generando propuesta…"
                  >
                    ✦ Generar propuesta IA
                  </Button>
                  <span>
                    Esta ejecución no modifica el proyecto ni persiste una estimación todavía.
                  </span>
                </div>

                {generateProposal.error && (
                  <div className={styles.errorBox}>
                    No se pudo generar la propuesta PoC. Revisa la API y vuelve a intentar.
                  </div>
                )}
              </Card>

              {proposal && (
                <Card className={styles.rolesCard}>
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={styles.agentEyebrow}>Propuesta IA</span>
                      <h2>Equipo y esfuerzo</h2>
                    </div>
                    <span className={styles.reviewBadge}>Por revisar</span>
                  </div>
                  <p className={styles.summaryText}>{proposal.summary}</p>
                  <RoleTable proposal={proposal} />
                </Card>
              )}

              {questionnaire.error && (
                <Card>No se pudo cargar la definición del cuestionario.</Card>
              )}

              {questionnaire.data && (
                <QuestionnaireBlueprintCard definition={questionnaire.data} />
              )}
            </div>

            <aside className={styles.summaryColumn}>
              <Card className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total estimado</span>
                <div className={styles.totalHours}>
                  {proposal ? formatHours(proposal.totalHours) : '—'}
                  <small> HH</small>
                </div>

                <div className={styles.summaryBlock}>
                  <span>Proyecto</span>
                  <strong>{projectLabel}</strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span>Modo de fuente</span>
                  <strong>{proposal?.sourceMode === 'poc_simulated' ? 'PoC simulada' : 'Drive'}</strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span>Documentos analizados</span>
                  <strong>{proposal?.documentsAnalyzed ?? 0}</strong>
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

                    <h3>Aclaraciones detectadas</h3>
                    <ol>
                      {proposal.clarifyingQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ol>
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
