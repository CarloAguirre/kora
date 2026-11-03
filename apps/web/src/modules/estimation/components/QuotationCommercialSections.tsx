import type { EstimationQuestion, QuotationDraftData, QuotationVersion } from '@kora/contracts';
import { useEstimationQuestionnaireDefinition } from '../api/estimation.queries';
import { Card } from '@/shared/components/ui/Card';
import styles from './QuotationCommercialSections.module.css';

type Cost = QuotationDraftData['costs'][number];
type Payment = QuotationDraftData['paymentPlan'][number];

const fmt = (amount: number) =>
  amount.toLocaleString('es-CL', { maximumFractionDigits: 4 });
const num = (raw: string) => Math.max(0, Number(raw) || 0);

function commercialNet(draft: QuotationDraftData, hourlyRate: number | null) {
  if (hourlyRate === null) return null;
  const teamHours = draft.mode === 'team'
    ? draft.teams.reduce((sum, team) =>
      sum + team.collaborators * (team.unit === 'day' ? team.duration / 5 : team.duration) *
        team.hoursPerWeek * team.dedicationPercent / 100, 0)
    : draft.phases.reduce((sum, phase) =>
      sum + phase.teamHours.reduce((hours, row) => hours + row.hours, 0), 0);
  const once = draft.costs.filter((cost) => cost.recurrence === 'once')
    .reduce((sum, cost) => sum + cost.amount, 0);
  return Math.round((teamHours * hourlyRate + once + Number.EPSILON) * 10000) / 10000;
}

function readableAnswer(questionId: string, value: unknown, version: QuotationVersion,
  fixedQuestions: readonly EstimationQuestion[]) {
  const definition = version.draft.aiPoc?.dynamicQuestions.find((question) =>
    question.id === questionId) ?? fixedQuestions.find((question) => question.id === questionId);
  const render = (item: unknown): string => {
    if (item === null || item === undefined) return 'Sin respuesta';
    if (typeof item === 'boolean') return item ? 'Sí' : 'No';
    if (typeof item === 'string') return definition?.options.find(
      (option) => option.value === item)?.label ?? item;
    if (typeof item === 'number') return String(item);
    if (Array.isArray(item)) return item.map(render).join(', ');
    return 'Respuesta estructurada';
  };
  return {
    label: definition?.question ?? ('Pregunta ' + questionId),
    value: render(value),
    assumption: definition?.assumptionIfSkipped,
  };
}

export function QuotationCommercialSections({
  draft, version, rate, currency, editable, onDraftChange,
}: {
  draft: QuotationDraftData;
  version: QuotationVersion;
  rate: number | null;
  currency: 'UF' | 'CLP' | 'USD';
  editable: boolean;
  onDraftChange: (patch: Partial<QuotationDraftData>) => void;
}) {
  const net = commercialNet(draft, rate);
  const sumPercent = draft.paymentPlan.reduce((sum, payment) => sum + payment.percent, 0);
  const editCost = (index: number, patch: Partial<Cost>) =>
    onDraftChange({ costs: draft.costs.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const editPayment = (index: number, patch: Partial<Payment>) =>
    onDraftChange({ paymentPlan: draft.paymentPlan.map(
      (row, i) => i === index ? { ...row, ...patch } : row,
    ) });
  const answers = version.draft.aiPoc?.answers ?? [];
  // Material histórico preservado en draft; la interfaz v5 no muestra estos desplegables.
  const showExtraDetails = false;
  const questionnaire = useEstimationQuestionnaireDefinition(false);

  return (
    <>
      <Card className={styles.surface}>
        <div className={styles.head}>
          <h2>Licencias y costos externos</h2>
          <p>No suman horas</p>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead><tr>
              <th>Descripción</th><th>Monto ({currency})</th><th>Cobro</th><th />
            </tr></thead>
            <tbody>
              {draft.costs.map((cost, index) => (
                <tr key={index}>
                  <td><input aria-label={'Descripción costo ' + (index + 1)}
                    value={cost.description} maxLength={500} disabled={!editable}
                    onChange={(event) => editCost(index, { description: event.target.value })} /></td>
                  <td><input aria-label={'Monto costo ' + (index + 1)}
                    type="number" min={0} step="0.01" value={cost.amount}
                    disabled={!editable} className={styles.right}
                    onChange={(event) => editCost(index, { amount: num(event.target.value) })} /></td>
                  <td><select aria-label={'Cobro costo ' + (index + 1)}
                    value={cost.recurrence} disabled={!editable}
                    onChange={(event) => editCost(index, {
                      recurrence: event.target.value as Cost['recurrence'],
                    })}>
                    <option value="once">Único</option>
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                  </select></td>
                  <td>{editable && <button className={styles.remove} type="button"
                    aria-label={'Eliminar costo ' + (index + 1)}
                    onClick={() => onDraftChange({
                      costs: draft.costs.filter((_, i) => i !== index),
                    })}>×</button>}</td>
                </tr>
              ))}
              {draft.costs.length === 0 && <tr><td colSpan={4} className={styles.empty}>
                Sin licencias ni costos externos.
              </td></tr>}
            </tbody>
          </table>
        </div>
        {editable && <button type="button" className={styles.add}
          onClick={() => onDraftChange({
            costs: [...draft.costs, { description: 'Nuevo costo', amount: 0, recurrence: 'once' }],
          })}>+ Agregar costo</button>}
      </Card>

      <Card className={styles.surface}>
        <div className={styles.head}>
          <h2>Plan de pago</h2>
          <p>Mismos tramos comerciales del proyecto</p>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table + ' ' + styles.payment}>
            <thead><tr>
              <th>Tramo</th><th>%</th><th>Hito de cobro</th>
              <th>Fase / fecha</th><th>Monto neto</th><th />
            </tr></thead>
            <tbody>
              {draft.paymentPlan.map((payment, index) => (
                <tr key={index}>
                  <td><input maxLength={120} aria-label={'Tramo de pago ' + (index + 1)}
                    value={payment.name} disabled={!editable}
                    onChange={(event) => editPayment(index, { name: event.target.value })} /></td>
                  <td><input aria-label={'Porcentaje de pago ' + (index + 1)}
                    className={styles.right} type="number" min={0} max={100}
                    step="0.01" value={payment.percent} disabled={!editable}
                    onChange={(event) => editPayment(index, { percent: num(event.target.value) })} /></td>
                  <td><select aria-label={'Hito de cobro ' + (index + 1)}
                    value={payment.trigger} disabled={!editable}
                    onChange={(event) => editPayment(index, {
                      trigger: event.target.value as Payment['trigger'],
                    })}>
                    <option value="approval">Aprobación del proyecto</option>
                    <option value="phase">Inicio de fase</option>
                    <option value="date">Fecha</option>
                  </select></td>
                  <td>
                    {payment.trigger === 'phase'
                      ? <select aria-label={'Fase de pago ' + (index + 1)}
                          value={payment.triggerPhase ?? ''} disabled={!editable}
                          onChange={(event) => editPayment(index, {
                            triggerPhase: event.target.value || null,
                          })}>
                          <option value="">Seleccionar fase</option>
                          {draft.phases.map((phase, phaseIndex) =>
                            <option key={phaseIndex} value={phase.name}>{phase.name}</option>)}
                        </select>
                      : payment.trigger === 'date'
                        ? <input type="date" aria-label={'Fecha de pago ' + (index + 1)}
                            value={payment.triggerDate ?? ''} disabled={!editable}
                            onChange={(event) => editPayment(index, {
                              triggerDate: event.target.value || null,
                            })} />
                        : <span className={styles.dash}>—</span>}
                  </td>
                  <td className={styles.amount}>
                    {net === null ? '—' : fmt(Math.round(net * payment.percent / 100 * 10000) / 10000) + ' ' + currency}
                  </td>
                  <td>{editable && <button className={styles.remove}
                    type="button" aria-label={'Eliminar tramo de pago ' + (index + 1)}
                    onClick={() => onDraftChange({
                      paymentPlan: draft.paymentPlan.filter((_, i) => i !== index),
                    })}>×</button>}</td>
                </tr>
              ))}
              {draft.paymentPlan.length === 0 && <tr><td colSpan={6} className={styles.empty}>
                Sin tramos de pago.
              </td></tr>}
            </tbody>
          </table>
        </div>
        {editable && <button type="button" className={styles.add}
          onClick={() => onDraftChange({
            paymentPlan: [...draft.paymentPlan,
              { name: 'Nuevo hito', percent: 0, trigger: 'approval' }],
          })}>+ Agregar tramo</button>}
        <p className={sumPercent === 100 ? styles.ok : styles.notice}>
          Plan de pago: {fmt(sumPercent)}% de 100%.
          {sumPercent !== 100 && ' Debe completar el 100% antes del envío o aprobación.'}
        </p>
      </Card>

      <Card className={styles.surface}>
        <div className={styles.head}><h2>Supuestos y exclusiones</h2></div>
        <textarea className={styles.notes} aria-label="Supuestos de la cotización"
          placeholder="Supuestos comerciales y técnicos, uno por línea"
          disabled={!editable} value={draft.assumptions.join('\n')}
          onChange={(event) => onDraftChange({
            assumptions: event.target.value.split('\n').slice(0, 100),
          })} />
        {showExtraDetails && <details className={styles.details}>
          <summary>Exclusiones del alcance ({draft.exclusions.filter(Boolean).length})</summary>
          <textarea className={styles.notes} aria-label="Exclusiones de la cotización"
            disabled={!editable} value={draft.exclusions.join('\n')}
            onChange={(event) => onDraftChange({
              exclusions: event.target.value.split('\n').slice(0, 100),
            })} />
        </details>}
        {showExtraDetails && answers.length > 0 &&
          <details className={styles.details}>
            <summary>Respuestas del cuestionario IA</summary>
            <dl className={styles.answers}>
              {answers.map((item, index) => {
                const answer = readableAnswer(item.questionId, item.value, version,
                  questionnaire.data?.fixedQuestions ?? []);
                return (
                  <div key={item.questionId + ':' + index}>
                    <dt>{answer.label}</dt>
                    <dd>{item.usedAssumption
                      ? 'Supuesto no confirmado: ' + (answer.assumption ?? 'pendiente de aclaración')
                      : answer.value}</dd>
                  </div>
                );
              })}
            </dl>
            <p className={styles.notice}>
              La evidencia original de las preguntas y respuestas permanece guardada
              en la versión, incluso al editar los campos comerciales.
            </p>
          </details>}
      </Card>
    </>
  );
}
