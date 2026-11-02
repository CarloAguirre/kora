import { useState } from 'react';
import type { QuotationVersion } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useApplyQuotationPlanning, useAppliedQuotationPlanning } from '../api/quotation.queries';
import styles from './QuotationPlanningAcceptanceCard.module.css';

/** Diferencia aceptación para PLANIFICACIÓN de aprobación comercial del cliente.
 * No configura fechas ni facturación. El backend revalida bajo transacción. */
export function QuotationPlanningAcceptanceCard({
  projectId, version, canManage, hasUnsavedChanges,
}: {
  projectId: string;
  version: QuotationVersion;
  canManage: boolean;
  hasUnsavedChanges: boolean;
}) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const applied = useAppliedQuotationPlanning(projectId);
  const mutation = useApplyQuotationPlanning(projectId);
  const edt = version.draft.aiPoc?.edt;
  if (!edt) return null;
  const currentApplied = applied.data?.versionId === version.id;
  const otherApplied = Boolean(applied.data && !currentApplied);
  const roles = version.draft.aiPoc?.proposal.roles ?? [];
  const mappings = version.draft.aiPoc?.roleTeamIds ?? {};
  const ready = version.status === 'draft' &&
    version.draft.analysisProjectionStatus === 'synced' &&
    roles.length > 0 && roles.every((role) => Boolean(mappings[role.role])) &&
    Object.keys(mappings).length === roles.length &&
    edt.totalHours > 0 && Math.abs(edt.totalHours - version.totalHours) <= 0.011 &&
    !hasUnsavedChanges && !otherApplied && !currentApplied && !applied.isLoading &&
    !applied.isError && canManage;
  const apply = async () => {
    if (!ready || mutation.isPending) return;
    if (!window.confirm(
      'Se crearán equipos, HH vendidas y fases reales en el Roadmap usando el archivo KDM DE PRUEBA. ' +
      'Las tareas quedarán como referencias SIN FECHAS ni asignados. No aprobará un contrato ni generará pagos. ' +
      'Solo se permite para un proyecto sin ejecución previa. ¿Confirmas?',
    )) return;
    setError('');
    setNotice('');
    try {
      const result = await mutation.mutateAsync({
        versionId: version.id,
        input: { revision: version.revision, confirmation: 'APLICAR_PLANIFICACION_KDM_DEMO' },
      });
      setNotice('Planificación inicial aplicada: ' + result.modules.length +
        ' fases y ' + result.totalHours + ' HH, sin facturación.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la planificación.');
    }
  };
  return (
    <Card>
      <div className={styles.head}>
        <div>
          <h2>EDT de referencia · Gemini</h2>
          <p>Desglose del documento KDM de demostración. Las HH de las tareas suman exactamente las HH cotizadas.</p>
        </div>
        <strong>{edt.totalHours.toLocaleString('es-CL')} HH</strong>
      </div>
      <p className={styles.notice}>
        Los módulos y tareas todavía no son trabajo programado. Al aceptar se registran las
        fases, equipos y horas iniciales en el proyecto. Las tareas quedan como referencia
        para planificar sus fechas y responsables después.
      </p>
      <div className={styles.modules}>
        {edt.modules.map((module, index) => (
          <details key={index} className={styles.module}>
            <summary>{module.name} · {module.tasks.length} tareas · {module.totalHours} HH</summary>
            <ol className={styles.taskList}>
              {module.tasks.map((task) => (
                <li key={task.wbs}>
                  <strong>{task.wbs} · {task.name}</strong>
                  <span>{task.role} · {task.hours} HH</span>
                  {task.description && <small>{task.description}</small>}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
      {currentApplied && <p role="status" className={styles.success}>
        Esta estimación ya se aplicó al Roadmap como planificación interna.
        No equivale a aprobación comercial del cliente.
      </p>}
      {otherApplied && <p role="status" className={styles.notice}>
        El proyecto ya tiene una planificación aplicada desde otra versión. No se reemplaza automáticamente.
      </p>}
      {hasUnsavedChanges && <p role="status" className={styles.notice}>
        Guarda primero el mapeo de equipos y las HH antes de aplicar.
      </p>}
      {applied.isError && <p role="alert" className={styles.error}>
        No fue posible comprobar si el proyecto ya tiene una planificación aplicada.
      </p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {canManage && !currentApplied && (
        <div className={styles.actions}>
          <p>Acción de Gerencia · solo proyectos sin datos operativos ni pagos previos.</p>
          <Button disabled={!ready} loading={mutation.isPending} onClick={() => void apply()}>
            Aceptar estimación y crear planificación
          </Button>
        </div>
      )}
    </Card>
  );
}
