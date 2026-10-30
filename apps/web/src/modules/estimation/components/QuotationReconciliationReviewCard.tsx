import { useState } from 'react';
import type {
  QuotationReconciliationDecision, QuotationTransferPreview, QuotationReconciliationReview,
  AssessQuotationReconciliationInput,
} from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
import { useQuotationReconciliationReviews, useSaveQuotationReconciliationReview,
  useQuotationReconciliationAssessments, useAssessQuotationReconciliation } from '../api/quotation.queries';
import { Select } from '@/shared/components/ui/Select';
import { buildReconciliationReview, emptyReconciliationChoices,
  type ReconciliationChoice } from '../lib/quotation-reconciliation-review';
import styles from './QuotationReconciliationReviewCard.module.css';

const OPTIONS: { value: QuotationReconciliationDecision; label: string }[] = [
  { value: 'pending', label: 'Pendiente de revisión' },
  { value: 'link_existing', label: 'Proponer vínculo a existente' },
  { value: 'propose_new', label: 'Proponer elemento nuevo' },
  { value: 'do_not_transfer', label: 'Proponer no transferir' },
];
const blank: ReconciliationChoice = { decision: 'pending', targetId: null, note: '' };

/**
 * Actas inmutables de DISCUSIÓN R3-d. Edición local y descarga; guardar añade
 * solo un evento a quotation_events. No aprueba ni modifica cotización/ejecución.
 */
export function QuotationReconciliationReviewCard({ preview, canSave = false, canAssess = false, currentUserId = null }: {
  preview: QuotationTransferPreview;
  canSave?: boolean;
  canAssess?: boolean;
  currentUserId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState(emptyReconciliationChoices);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const history = useQuotationReconciliationReviews(preview.projectId, preview.versionId, expanded);
  const saveMutation = useSaveQuotationReconciliationReview(preview.projectId, preview.versionId);
  const assessments = useQuotationReconciliationAssessments(preview.projectId, preview.versionId, expanded);
  const assessMutation = useAssessQuotationReconciliation(preview.projectId, preview.versionId);
  const [assessmentDecision, setAssessmentDecision] =
    useState<AssessQuotationReconciliationInput['decision']>('changes_requested');
  const [assessmentReason, setAssessmentReason] = useState('');
  const [assessmentError, setAssessmentError] = useState('');
  const [assessmentNotice, setAssessmentNotice] = useState('');
  const reconciliation = preview.edtReconciliation;
  const existingModules = reconciliation.availableExistingModules ?? [];
  if (reconciliation.source === 'no_analysis') return (
    <p className={styles.warning}>
      No se puede preparar un acta de correspondencias sin EDT granular. La versión requiere un análisis estructurado.
    </p>
  );

  const setModule = (index: number, moduleWbs: readonly string[], change: ReconciliationChoice) => {
    setChoices((previous) => {
      const activities = { ...previous.activities };
      for (const wbs of moduleWbs) {
        // Cambiar de módulo/decisión invalida los vínculos de tareas previos.
        delete activities[wbs];
        if (change.decision === 'do_not_transfer') {
          activities[wbs] = { decision: 'do_not_transfer', targetId: null, note: '' };
        }
      }
      return {
        modules: { ...previous.modules, [index]: change },
        activities,
      };
    });
    setError('');
  };

  const downloadReview = (review: QuotationReconciliationReview, suffix: string) => {
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' }),
    );
    const link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = 'kora-conciliacion-' + preview.projectId.slice(0, 8) +
      '-v' + review.versionNumber + '-r' + review.versionRevision + suffix + '.json';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const saveReview = async () => {
    if (!canSave || saveMutation.isPending) return;
    setError('');
    setNotice('');
    try {
      const document = buildReconciliationReview(preview, choices, new Date().toISOString());
      const saved = await saveMutation.mutateAsync(document);
      setNotice('Acta guardada en el historial. Registro ' + saved.id.slice(0, 8) +
        '. Sigue pendiente de discusión; no se traspasaron HH.');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'No se pudo guardar el acta.');
    }
  };
  const exportReview = () => {
    try {
      const document = buildReconciliationReview(preview, choices, new Date().toISOString());
      downloadReview(document, '');
      setError('');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'No se pudo generar el acta.');
    }
  };
  const latestReview = history.data?.[0];
  const latestAssessment = assessments.data?.find((record) => record.reviewId === latestReview?.id);
  const latestHasUnresolved = latestReview?.review.issues.some((issue) =>
    /^(MODULO_PENDIENTE|ACTIVIDAD_PENDIENTE|MODULO_SIN_FUNDAMENTO|DESTINO_COMPARTIDO|TAREA_COMPARTIDA|EDT_DESACTUALIZADA|HH_DIVERGENTES):/.test(issue)) ?? false;
  const mayAssess = Boolean(
    canAssess && latestReview && !latestAssessment && !assessments.isLoading && !assessments.isError &&
    latestReview.actorUserId !== currentUserId &&
    latestReview.review.versionRevision === preview.revision &&
    !assessMutation.isPending
  );
  const submitAssessment = async () => {
    if (!mayAssess || !latestReview) return;
    setAssessmentError('');
    setAssessmentNotice('');
    try {
      const result = await assessMutation.mutateAsync({
        reviewId: latestReview.id,
        versionRevision: latestReview.review.versionRevision,
        decision: assessmentDecision,
        reason: assessmentReason.trim(),
      });
      setAssessmentNotice(result.decision === 'changes_requested'
        ? 'Se registraron observaciones técnicas; la cotización no cambió.'
        : 'Se registró la revisión técnica; no es aprobación de cotización.');
      setAssessmentReason('');
    } catch (exception) {
      setAssessmentError(exception instanceof Error ? exception.message
        : 'No fue posible registrar la evaluación técnica.');
    }
  };
  const reviewedModules = reconciliation.modules.filter((_, index) =>
    (choices.modules[index]?.decision ?? 'pending') !== 'pending').length;
  const reviewedActivities = reconciliation.modules.flatMap((module) => module.activities)
    .filter((activity) => (choices.activities[activity.wbs]?.decision ?? 'pending') !== 'pending').length;

  return (
    <div className={styles.box}>
      <div className={styles.header}>
        <div>
          <h3>Acta de conciliación D04</h3>
          <p>Revisa vínculos por ID, registra propuestas y consulta el historial de actas.
            Guardar un acta no aprueba ni traspasa HH.</p>
        </div>
        <Button size="sm" variant="outline" aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Cerrar acta' : 'Preparar acta'}
        </Button>
      </div>
      {expanded && (
        <div className={styles.body}>
          <p className={styles.count}>
            Módulos revisados: {reviewedModules}/{reconciliation.modules.length} ·
            Actividades: {reviewedActivities}/{reconciliation.activityCount}
          </p>
          {reconciliation.source === 'modified_analysis' && (
            <p className={styles.warning} role="status">
              EDT desactualizada respecto al presupuesto comercial. Esta revisión no reconcilia automáticamente las HH.
            </p>
          )}
          {reconciliation.modules.map((module, index) => {
            const selected = choices.modules[index] ?? blank;
            const chosenModule = existingModules.find((item) => item.id === selected.targetId);
            return (
              <details key={index} className={styles.module}>
                <summary>{module.name} · {module.proposedHours.toLocaleString('es-CL')} HH
                  <span>{selected.decision === 'pending' ? 'Por revisar' : 'Propuesta registrada localmente'}</span>
                </summary>
                <div className={styles.moduleBody}>
                  <Select label={'Tratamiento del módulo ' + module.name} value={selected.decision}
                    options={OPTIONS}
                    onChange={(e) => setModule(index, module.activities.map((item) => item.wbs), {
                      decision: e.target.value as QuotationReconciliationDecision,
                      targetId: null, note: selected.note,
                    })} />
                  {selected.decision === 'link_existing' && (
                    <Select label="Módulo operativo elegido explícitamente"
                      value={selected.targetId ?? ''} placeholder="Selecciona un módulo real"
                      options={existingModules.map((candidate) => ({
                        value: candidate.id,
                        label: candidate.name + ' · ' + candidate.id.slice(0, 8),
                      }))}
                      onChange={(e) => {
                        const targetId = e.target.value || null;
                        setModule(index, module.activities.map((item) => item.wbs),
                          { ...selected, targetId });
                      }} />
                  )}
                  <label className={styles.field}>Justificación del módulo
                    <textarea maxLength={2000} rows={2} value={selected.note}
                      onChange={(e) => setChoices((old) => ({
                        ...old, modules: { ...old.modules, [index]: { ...selected, note: e.target.value } },
                      }))} placeholder="Fundamento y pendiente de validar con el equipo..." />
                  </label>
                  {module.activities.length > 0 && (
                    <div className={styles.activityList}>
                      <strong>Actividades del EDT · {module.activities.length}</strong>
                      {module.activities.map((activity) => {
                        const choice = choices.activities[activity.wbs] ?? blank;
                        return (
                          <div key={activity.wbs} className={styles.activity}>
                            <p><strong>{activity.wbs}</strong> · {activity.description}
                              {' '}({activity.proposedHours.toLocaleString('es-CL')} HH · {activity.role})</p>
                            <Select label={'Tratamiento WBS ' + activity.wbs}
                              value={choice.decision} options={OPTIONS}
                              onChange={(e) => setChoices((old) => ({
                                ...old,
                                activities: {
                                  ...old.activities,
                                  [activity.wbs]: {
                                    ...choice, decision: e.target.value as QuotationReconciliationDecision,
                                    targetId: null,
                                  },
                                },
                              }))} />
                            {choice.decision === 'link_existing' && (
                              <Select label="Tarea existente elegida por ID"
                                value={choice.targetId ?? ''} placeholder="Selecciona una tarea del módulo"
                                options={(chosenModule?.tasks ?? []).map((task) => ({
                                  value: task.id,
                                  label: task.name + ' · ' + task.status + ' · ' + task.id.slice(0, 8),
                                }))}
                                onChange={(e) => setChoices((old) => ({
                                  ...old,
                                  activities: {
                                    ...old.activities,
                                    [activity.wbs]: { ...choice, targetId: e.target.value || null },
                                  },
                                }))} />
                            )}
                            <label className={styles.field}>Nota WBS
                              <textarea rows={2} maxLength={2000} value={choice.note}
                                onChange={(e) => setChoices((old) => ({
                                  ...old, activities: {
                                    ...old.activities, [activity.wbs]: { ...choice, note: e.target.value },
                                  },
                                }))} />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          <p className={styles.warning}>
            Los cambios de este formulario son locales hasta que guardes el acta.
            Exporta o guarda antes de cambiar de versión o actualizar el preflight.
            Las actas son propuestas: D04–D06 siguen pendientes y el traspaso está bloqueado.
          </p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          <div className={styles.actions}>
            <Button variant="outline" onClick={exportReview}>Exportar acta JSON de revisión</Button>
            <Button onClick={() => void saveReview()} disabled={!canSave || saveMutation.isPending}
              loading={saveMutation.isPending}>Guardar acta en Kora</Button>
          </div>
          {!canSave && <p className={styles.warning}>Guardado deshabilitado: la versión o el proyecto no admite nuevas revisiones de borrador. Puedes exportar el JSON.</p>}
          <div className={styles.history}>
            <div className={styles.assessmentIntro}>
              <strong>Evaluación técnica de actas</strong>
              <p>Los estados «Revisada para discusión» y «Solicitar cambios» solo documentan una revisión interna.
                No aprueban el contrato ni cambian fases, HH o tareas de ejecución.</p>
            </div>
            {assessments.isError && <p role="alert" className={styles.error}>
              No se pudo consultar el estado de las evaluaciones técnicas.
            </p>}
            {canAssess && latestReview && !latestAssessment && !assessments.isLoading && !assessments.isError && (
              <div className={styles.assessmentForm}>
                <strong>Evaluar la última acta · {latestReview.id.slice(0, 8)}</strong>
                {latestReview.actorUserId === currentUserId
                  ? <p className={styles.warning}>No puedes evaluar un acta creada por ti mismo.</p>
                  : latestReview.review.versionRevision !== preview.revision
                    ? <p className={styles.warning}>Esta acta corresponde a una revisión anterior de la cotización.</p>
                    : (
                      <>
                        <Select label="Resultado de la revisión técnica"
                          value={assessmentDecision}
                          options={[
                            { value: 'changes_requested', label: 'Solicitar cambios' },
                            { value: 'reviewed_for_discussion', label: 'Revisada para discusión' },
                          ]}
                          onChange={(event) => setAssessmentDecision(
                            event.target.value as AssessQuotationReconciliationInput['decision'],
                          )} />
                        <label className={styles.field}>Fundamento de la evaluación técnica
                          <textarea rows={3} maxLength={2000} value={assessmentReason}
                            onChange={(event) => setAssessmentReason(event.target.value)}
                            placeholder="Documenta qué verificaste, qué riesgos permanecen y los ajustes requeridos..." />
                        </label>
                        {assessmentDecision === 'reviewed_for_discussion' && latestHasUnresolved &&
                          <p className={styles.warning}>
                            Hay decisiones o HH sin conciliar. Esta acta requiere solicitar cambios antes de considerarse revisada.
                          </p>}
                        <Button variant="outline" loading={assessMutation.isPending}
                          disabled={!mayAssess || assessmentReason.trim().length < 10 ||
                            (assessmentDecision === 'reviewed_for_discussion' && latestHasUnresolved)}
                          onClick={() => void submitAssessment()}>Registrar evaluación técnica</Button>
                        {assessmentError && <p role="alert" className={styles.error}>{assessmentError}</p>}

                      </>
                    )}
              </div>
            )}

            {assessmentNotice && <p role="status" className={styles.notice}>{assessmentNotice}</p>}
            <strong>Historial guardado en Kora (hasta 25 actas)</strong>
            {history.isLoading && <p>Cargando historial…</p>}
            {history.isError && <p role="alert" className={styles.error}>
              No se pudo consultar el historial de actas.
            </p>}
            {history.data?.length === 0 && <p>Aún no hay actas guardadas en esta versión.</p>}
            {history.data?.map((entry) => (
              <div className={styles.historyRow} key={entry.id}>
                <div>
                  <strong>Revisión comercial {entry.review.versionRevision}</strong>
                  <small>{new Date(entry.occurredAt).toLocaleString('es-CL')} ·
                    {' '}Usuario {entry.actorUserId?.slice(0, 8) ?? 'no disponible'} ·
                    {' '}{entry.review.moduleDecisions.length} módulos ·
                    {' '}{entry.review.issues.length} observaciones</small>
                  <small>Acta de discusión, no aprobada · ID {entry.id.slice(0, 8)}</small>
                  {assessments.data?.filter((item) => item.reviewId === entry.id).map((item) => (
                    <small key={item.id}>
                      Revisión técnica: {item.decision === 'changes_requested' ? 'Se solicitaron cambios' : 'Revisada para discusión'}
                      {' · '}{new Date(item.occurredAt).toLocaleString('es-CL')}
                      {' · '}Revisor {item.reviewerUserId?.slice(0, 8) ?? 'no disponible'}
                      {' · '}{item.reason}
                    </small>
                  ))}
                </div>
                <Button variant="outline" size="sm"
                  onClick={() => downloadReview(entry.review, '-' + entry.id.slice(0, 8))}>
                  Descargar acta
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
