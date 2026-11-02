import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  EstimationAnswerValue,
  EstimationQuestion,
  ProjectDetail,
  SubmitEstimationAnswerInput,
} from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { TextField } from '@/shared/components/ui/TextField';
import {
  useAnalyzeEstimationPoc,
  useEstimationQuestionnaireDefinition,
} from '../api/estimation.queries';
import { useGenerateAiDemoQuotationVersion } from '../api/quotation.queries';
import { DEMO_KDM_FOLDER_URL } from '../lib/demo-source';
import styles from './AiQuotationWizardModal.module.css';

const STAGES = ['Análisis', 'Entendimiento', 'Condiciones', 'Aclaraciones', 'Confirmación'] as const;

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
        Prellenada desde el documento de demostración: <span className={styles.sourceBadge}>{prefillSource}</span>.
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
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const questionnaire = useEstimationQuestionnaireDefinition();
  const analysis = useAnalyzeEstimationPoc();
  const generate = useGenerateAiDemoQuotationVersion(project.id);

  const verifiedAnalysis = analysis.data?.provider === 'gemini' &&
    analysis.data.sourceMode === 'poc_simulated' && analysis.data.documentsAnalyzed > 0
    ? analysis.data : null;
  const fixed = questionnaire.data?.fixedQuestions ?? [];
  const dynamic = verifiedAnalysis?.dynamicQuestions ?? [];
  const working = analysis.isPending || generate.isPending;
  const relevant = stage === 2 ? fixed : dynamic;
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
    setError('');
    setInvalidId(null);
    try {
      const result = await analysis.mutateAsync({
        projectId: project.id,
        projectName: project.name,
        clientName: project.client?.companyName ?? null,
        driveFolderUrl: DEMO_KDM_FOLDER_URL,
        instructions: instructions.trim() || null,
      });
      if (result.provider !== 'gemini' || result.sourceMode !== 'poc_simulated' ||
          result.documentsAnalyzed < 1) {
        setError('No se obtuvo un análisis real de Gemini sobre el documento KDM.');
        return;
      }
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
      setError(reason instanceof Error ? reason.message : 'No se pudo analizar el documento KDM.');
    }
  };

  const next = async () => {
    setError('');
    if (stage === 0) {
      if (questionnaire.isLoading || questionnaire.isError) return;
      await analyze();
      return;
    }
    if (stage === 1) {
      if (understanding.trim().length < 20) {
        setError('Revisa el entendimiento; debe contener al menos 20 caracteres.');
        return;
      }
      setStage(2);
      return;
    }
    if (stage === 2 || stage === 3) {
      const missing = relevant.find((question) => question.required && !answered(question));
      if (missing) {
        setInvalidId(missing.id);
        setError('Completa todas las respuestas obligatorias de esta etapa.');
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
        driveFolderUrl: DEMO_KDM_FOLDER_URL,
        instructions: instructions.trim() || null,
        confirmedUnderstanding: understanding.trim(),
        dynamicQuestions: dynamic,
        answers: collectAnswers(),
      });
      onClose();
      navigate(projectQuotationPath(project) + '?version=' + created.id + '&map-ai=1');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message :
        'No se pudo generar y guardar la cotización.');
    }
  };

  const back = () => {
    setError('');
    setInvalidId(null);
    setStage((current) => Math.max(0, current - 1));
  };

  return (
    <Modal open wide className={styles.dialog}
      title="✦ Nueva cotización con el agente IA"
      onClose={onClose}
      dismissible={!working}
      footer={<>
        <Button variant="outline" className={styles.secondaryAction}
          disabled={working}
          onClick={stage === 0 ? onClose :
            stage === 1 ? () => setEditingUnderstanding((current) => !current) : back}>
          {stage === 0 ? 'Cancelar' :
            stage === 1 ? editingUnderstanding ? 'Guardar resumen' : 'Editar' : 'Atrás'}
        </Button>
        <Button className={styles.primaryAction} loading={working} disabled={
          (stage === 0 && (questionnaire.isLoading || questionnaire.isError)) ||
          (stage > 0 && !verifiedAnalysis)
        } onClick={() => void next()}>
          {stage === 0 ? 'Analizar proyecto' : stage === 1 ? 'Está correcto' :
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
          <p className={styles.intro}>El agente lee todo antes de preguntar. Usando:
            {' '}<strong>Documento de demostración KDM</strong>
          </p>
          <ul className={styles.documents} aria-label="Documentos que analizará el agente">
            <li>
              <span className={styles.docIcon} aria-hidden="true">📄</span>
              <span>Requerimiento_KDM.pdf</span>
              <span className={styles.docDate}>Fuente de prueba</span>
            </li>
          </ul>
          <p className={styles.demoNote}>
            No existe una conexión real con Google Drive. El documento KDM de ejemplo
            sustituye temporalmente los antecedentes del proyecto.
          </p>
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
          {analysis.isPending && <p role="status" className={styles.progress}>
            Gemini está analizando el documento y preparando el entendimiento inicial.
          </p>}
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
            <p>Validar con el cliente los resultados de esta estimación basada en KDM,
              antes de utilizarla en un proyecto real.</p>
          </div>
          <p className={styles.warning}>La cotización se guardará como borrador
            con revisión IA pendiente. No se enviará ni aprobará automáticamente.</p>
        </section>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Modal>
  );
}
