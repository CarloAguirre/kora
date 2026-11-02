import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isQuotationDraftEligibleProject, type ProjectDetail } from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useAppliedQuotationPlanning, useProjectQuotation } from '../api/quotation.queries';
import { Button } from '@/shared/components/ui/Button';
import { NewProjectQuotationModal } from './NewProjectQuotationModal';
import styles from './ProjectQuotationCard.module.css';

export function ProjectQuotationCard({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error } = useProjectQuotation(project.id);
  const applied = useAppliedQuotationPlanning(project.id);
  const [newOpen, setNewOpen] = useState(false);
  const versions = [...(data?.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const eligible = isQuotationDraftEligibleProject(project);
  const number = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  return (
    <section className={styles.tabContent} aria-label="Cotizaciones del proyecto">
      {isLoading ? <p className={styles.helper}>Consultando cotizaciones…</p>
        : error ? <p role="alert" className={styles.error}>No fue posible consultar las cotizaciones del proyecto.</p>
        : versions.length === 0 ? (
          <div className={styles.empty}>
            <strong>Este proyecto aún no tiene cotización</strong>
            <p>Créala con el agente IA, en blanco o copiando otra.</p>
            {eligible ? <Button onClick={() => setNewOpen(true)}>+ Nueva cotización</Button>
              : <span className={styles.helper}>Las nuevas versiones no están disponibles para este proyecto.</span>}
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <div>
                <h3>Versiones de la cotización</h3>
                <p>Las versiones enviadas o aprobadas son históricas y no se editan.</p>
              </div>
              {eligible && <Button size="sm" onClick={() => setNewOpen(true)}>+ Nueva cotización</Button>}
            </div>
            <div className={styles.scroll}>
              <table className={styles.versions}>
                <thead><tr><th>Versión</th><th>Estado</th><th>Horas</th><th>Total</th><th>Acciones</th></tr></thead>
                <tbody>{versions.map((v) => (
                  <tr key={v.id}>
                    <td><strong>v{v.versionNumber} · {v.name}</strong>
                      <small>{new Date(v.createdAt).toLocaleDateString('es-CL')}
                        {v.origin === 'ai' ? ' · Origen IA (KDM de prueba)' : ''}</small></td>
                    <td><span className={styles.status}>
                      {applied.data?.versionId === v.id ? 'Planificación aplicada (no aprobación comercial)' :
                        v.status === 'draft' ? 'Borrador' :
                          v.status === 'sent' ? 'Enviada al cliente' : 'Aprobada por el cliente'}
                    </span></td>
                    <td>{number(v.totalHours)} HH</td>
                    <td>{v.totalAmount === null ? 'Sin valor HH' : number(v.totalAmount) + ' ' + v.currency}</td>
                    <td><Link to={projectQuotationPath(project) + '?version=' + v.id}>Abrir en calculadora</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      {newOpen && <NewProjectQuotationModal project={project} versions={data?.versions ?? []}
        onClose={() => setNewOpen(false)} />}
    </section>
  );
}
