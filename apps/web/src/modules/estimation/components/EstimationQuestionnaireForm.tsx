import { useMemo, useState } from 'react';
import type {
  EstimationAnswerValue,
  EstimationQuestion,
  SubmitEstimationAnswerInput,
} from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import styles from './EstimationQuestionnaireForm.module.css';

interface EstimationQuestionnaireFormProps {
  fixedQuestions: readonly EstimationQuestion[];
  dynamicQuestions: readonly EstimationQuestion[];
  submitting?: boolean;
  onSubmit: (answers: SubmitEstimationAnswerInput[]) => void;
}

function hasAnswer(value: EstimationAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function EstimationQuestionnaireForm({
  fixedQuestions,
  dynamicQuestions,
  submitting = false,
  onSubmit,
}: EstimationQuestionnaireFormProps) {
  const questions = useMemo(
    () => [...fixedQuestions, ...dynamicQuestions],
    [dynamicQuestions, fixedQuestions],
  );
  const [answers, setAnswers] = useState<Record<string, EstimationAnswerValue>>({});
  const [showErrors, setShowErrors] = useState(false);

  const setAnswer = (questionId: string, value: EstimationAnswerValue) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const toggleMulti = (questionId: string, option: string) => {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as string[] : [];
    setAnswer(
      questionId,
      current.includes(option)
        ? current.filter((value) => value !== option)
        : [...current, option],
    );
  };

  const submit = () => {
    const missingRequired = questions.some(
      (question) => question.required && !hasAnswer(answers[question.id]),
    );
    if (missingRequired) {
      setShowErrors(true);
      return;
    }

    onSubmit(
      questions
        .filter((question) => hasAnswer(answers[question.id]))
        .map((question) => ({
          questionId: question.id,
          value: answers[question.id] ?? null,
          usedAssumption: false,
        })),
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <div>
          <span>Contexto de estimación</span>
          <h2>Confirma solo lo que falta</h2>
        </div>
        <strong>{questions.length} preguntas</strong>
      </div>

      <p className={styles.description}>
        La idea es que esta etapa dure pocos minutos. Las preguntas dinámicas aparecen únicamente
        cuando una ambigüedad puede cambiar el alcance, las HH o la arquitectura.
      </p>

      <div className={styles.questions}>
        {questions.map((question, index) => {
          const value = answers[question.id];
          const hasError = showErrors && question.required && !hasAnswer(value);
          const isDynamic = question.kind === 'dynamic';

          return (
            <section
              key={question.id}
              className={[styles.question, hasError ? styles.questionError : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.questionHead}>
                <div>
                  <span className={styles.number}>{index + 1}</span>
                  <span className={styles.category}>{question.category}</span>
                  {isDynamic && <span className={styles.dynamic}>Detectada por IA</span>}
                </div>
                {isDynamic && (
                  <span className={styles.impact}>Impacto {question.impact === 'high' ? 'alto' : 'medio'}</span>
                )}
              </div>

              <h3>{question.question}</h3>
              {question.reason && <p className={styles.reason}>{question.reason}</p>}

              {question.answerType === 'single_choice' && (
                <div className={styles.choiceGrid}>
                  {question.options.map((option) => (
                    <label key={option.value} className={styles.choice}>
                      <input
                        type="radio"
                        name={question.id}
                        checked={value === option.value}
                        onChange={() => setAnswer(question.id, option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.answerType === 'multi_choice' && (
                <div className={styles.choiceGrid}>
                  {question.options.map((option) => {
                    const selected = Array.isArray(value) && value.includes(option.value);
                    return (
                      <label key={option.value} className={styles.choice}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMulti(question.id, option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {question.answerType === 'confirmation' && (
                <div className={styles.choiceGrid}>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={value === true}
                      onChange={() => setAnswer(question.id, true)}
                    />
                    <span>Sí</span>
                  </label>
                  <label className={styles.choice}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={value === false}
                      onChange={() => setAnswer(question.id, false)}
                    />
                    <span>No</span>
                  </label>
                </div>
              )}

              {question.answerType === 'text' && (
                <textarea
                  className={styles.textarea}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                  placeholder="Escribe una respuesta breve"
                />
              )}

              {question.answerType === 'date' && (
                <input
                  className={styles.input}
                  type="date"
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                />
              )}

              {question.answerType === 'number' && (
                <input
                  className={styles.input}
                  type="number"
                  value={typeof value === 'number' ? value : ''}
                  onChange={(event) =>
                    setAnswer(
                      question.id,
                      event.target.value === '' ? null : Number(event.target.value),
                    )
                  }
                />
              )}

              {hasError && <span className={styles.error}>Esta respuesta es necesaria para continuar.</span>}
            </section>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span>Después de confirmar, la PoC genera la propuesta final de HH.</span>
        <Button onClick={submit} loading={submitting} loadingText="Generando estimación…">
          Generar estimación final
        </Button>
      </div>
    </div>
  );
}
