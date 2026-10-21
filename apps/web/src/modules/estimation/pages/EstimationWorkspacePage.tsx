import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
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

export function EstimationWorkspacePage() {
  const { projectId } = useParams();
  const { project, questionnaire, isLoading } = useEstimationWorkspace(projectId ?? null);

  if (!projectId) {
    return (
      <DashboardLayout title="Estimación inteligente">
        <Card>No se indicó un proyecto para estimar.</Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Estimación inteligente">
      <div className={styles.page}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Calculadora · base técnica</span>
            <h1>{project.data?.name ?? 'Proyecto'}</h1>
            <p>
              Workspace inicial del flujo de estimación asistida por IA. En esta iteración queda
              conectado el contrato compartido y la definición real del cuestionario.
            </p>
          </div>
          <span className={styles.status}>Estructura inicial</span>
        </div>

        <Card className={styles.pipelineCard}>
          <h2>Pipeline previsto</h2>
          <div className={styles.pipeline}>
            {PIPELINE.map((step, index) => (
              <div key={step} className={styles.pipelineStep}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </Card>

        {isLoading && <Card>Cargando configuración…</Card>}

        {questionnaire.error && (
          <Card>No se pudo cargar la definición del cuestionario.</Card>
        )}

        {questionnaire.data && (
          <QuestionnaireBlueprintCard definition={questionnaire.data} />
        )}

        <Card className={styles.nextCard}>
          <h2>Siguiente vertical slice</h2>
          <p>
            Conectar la carpeta Drive del proyecto, generar el contexto normalizado
            (requisitos, historias, contexto técnico y gaps) y convertir los gaps de
            impacto alto/medio en preguntas dinámicas.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
