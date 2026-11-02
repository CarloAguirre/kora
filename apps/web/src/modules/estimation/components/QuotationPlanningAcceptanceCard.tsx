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
      <p className={styles.notice}>
        Esta EDT no se materializa al aceptar la propuesta IA. Solo se traspasa
        después de registrar la aprobación del cliente.
      </p>
    </Card>
  );
}
