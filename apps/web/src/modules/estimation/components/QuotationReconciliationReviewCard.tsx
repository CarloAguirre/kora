import { useState } from 'react';
import type {
  QuotationReconciliationDecision, QuotationTransferPreview,
} from '@kora/contracts';
import { Button } from '@/shared/components/ui/Button';
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
 * Acta LOCAL de trabajo para D04. No envía decisiones a servidor, no modifica
 * cotización ni crea relaciones con tareas. El JSON permite revisión externa.
 */
export function QuotationReconciliationReviewCard({ preview }: {
  preview: QuotationTransferPreview;
}) {
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState(emptyReconciliationChoices);
  const [error, setError] = useState('');
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
  const exportReview = () => {
    try {
      const document = buildReconciliationReview(preview, choices, new Date().toISOString());
      const objectUrl = URL.createObjectURL(
        new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
      );
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = 'kora-conciliacion-' + preview.projectId.slice(0, 8) +
        '-v' + preview.versionNumber + '-r' + preview.revision + '.json';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setError('');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'No se pudo generar el acta.');
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
          <p>Revisa vínculos por ID, documenta propuestas y exporta un JSON de discusión.
            Las decisiones son locales: no quedan guardadas en Kora ni autorizan traspasos.</p>
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
            Esta revisión se mantiene solo en memoria. Exporta el JSON antes de cerrar
            esta pantalla, cambiar de versión o actualizar la lectura del proyecto.
            Incluso con todas las filas revisadas, D04–D06 siguen pendientes y el traspaso permanece bloqueado.
          </p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <Button variant="outline" onClick={exportReview}>
            Exportar acta JSON de revisión
          </Button>
        </div>
      )}
    </div>
  );
}
