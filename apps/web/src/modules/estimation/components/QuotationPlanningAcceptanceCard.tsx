import type { QuotationVersion } from '@kora/contracts';
import { Card } from '@/shared/components/ui/Card';
import styles from './QuotationPlanningAcceptanceCard.module.css';

/** Diferencia aceptación para PLANIFICACIÓN de aprobación comercial del cliente.
 * No configura fechas ni facturación. El backend revalida bajo transacción. */
export function QuotationPlanningAcceptanceCard({
  version,
}: {
  version: QuotationVersion;
}) {
  const edt = version.draft.aiPoc?.edt;
  if (!edt) return null;
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
        La EDT y sus HH se conservan en la versión comercial hasta su aprobación y traspaso.
        Las tareas son referencias sin fechas ni responsables.
      </p>
      <div className={styles.modules}>
        {edt.modules.map((module, index) => (
          <details key={index} className={styles.module} name="quotation-edt-modules" defaultOpen={index === 0}>
            <summary className={styles.moduleHeader}>
              <span className={styles.moduleIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.moduleTitle}>
                <strong>{module.name}</strong>
                <small>{module.tasks.length} {module.tasks.length === 1 ? 'tarea' : 'tareas'} · Pulsa para ver el desglose</small>
              </span>
              <span className={styles.moduleHours}>{module.totalHours.toLocaleString('es-CL')} HH</span>
              <span className={styles.chevron} aria-hidden="true" />
            </summary>
            <div className={styles.moduleBody}>
              {module.tasks.map((task) => (
                <details key={task.wbs} className={styles.task}>
                  <summary className={styles.taskHeader}>
                    <span className={styles.taskCode}>{task.wbs}</span>
                    <span className={styles.taskTitle}>{task.name}</span>
                    <span className={styles.taskHours}>{task.hours.toLocaleString('es-CL')} HH</span>
                    <span className={styles.chevron} aria-hidden="true" />
                  </summary>
                  <div className={styles.taskBody}>
                    <span className={styles.role}>Perfil responsable: {task.role}</span>
                    <p>{task.description?.trim() || 'Gemini no incorporó una descripción adicional para esta tarea.'}</p>
                    <small>Referencia de estimación. No se asignan fechas ni colaboradores hasta el traspaso aprobado.</small>
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
      <p className={styles.notice}>
        Esta EDT no se materializa al aceptar la propuesta IA. Solo se traspasa
        después de registrar la aprobación del cliente.
      </p>
    </Card>
  );
}
