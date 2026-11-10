import type { EstimationQuestionnaireDefinition } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import styles from './QuestionnaireBlueprintCard.module.css';

interface QuestionnaireBlueprintCardProps {
  definition: EstimationQuestionnaireDefinition;
}

export function QuestionnaireBlueprintCard({ definition }: QuestionnaireBlueprintCardProps) {
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>Cuestionario mínimo</h2>
          <p>
            Las preguntas resueltas por los documentos se prellenarán u omitirán. Las dinámicas se
            seleccionarán solo cuando cambien materialmente la estimación.
          </p>
        </div>
        <div className={styles.metric}>
          <strong>{definition.targetMinutesMin}–{definition.targetMinutesMax} min</strong>
          <span>objetivo de respuesta</span>
        </div>
      </div>

      <div className={styles.grid}>
        {definition.fixedQuestions.map((question) => (
          <article key={question.id} className={styles.question}>
            <div className={styles.questionTop}>
              <span className={styles.id}>{question.id}</span>
              <span className={styles.category}>{question.category}</span>
            </div>
            <strong>{question.question}</strong>
            {question.reason && <p>{question.reason}</p>}
          </article>
        ))}
      </div>

      <div className={styles.footer}>
        Máximo {definition.maxDynamicFirstRound} aclaraciones dinámicas en la primera ronda y{' '}
        {definition.maxDynamicFollowUp} adicionales solo si aparece un bloqueo.
      </div>
    </Card>
  );
}
