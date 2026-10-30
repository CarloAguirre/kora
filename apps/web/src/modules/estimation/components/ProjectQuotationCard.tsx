import { Link } from 'react-router-dom';
import { isQuotationDraftEligibleProject, type ProjectDetail } from '@kora/contracts';
import { projectQuotationPath } from '@/app/router/paths';
import { useProjectQuotation } from '../api/quotation.queries';
import { Card } from '@/shared/components/ui/Card';
import styles from './ProjectQuotationCard.module.css';

export function ProjectQuotationCard({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error } = useProjectQuotation(project.id);
  const versions = data?.versions ?? [];
  const latest = versions[versions.length - 1];
  const eligible = isQuotationDraftEligibleProject(project);

  return (
    <Card>
      <div className={styles.head}>
        <div>
          <h3>Cotizaciones</h3>
          <p>Historial comercial de versiones. No altera la planificación hasta el traspaso aprobado.</p>
        </div>
        <Link to={projectQuotationPath(project)}>{eligible && versions.length === 0 ? 'Nueva cotización' : 'Abrir cotizaciones'}</Link>
      </div>
      {isLoading ? <p className={styles.helper}>Consultando cotizaciones…</p>
        : error ? <p className={styles.error}>No se pudo consultar el historial comercial (verifica la migración 0048).</p>
        : !latest ? <p className={styles.helper}>Aún no hay cotizaciones guardadas.</p>
        : <div className={styles.summary}>
            <span>{versions.length} {versions.length === 1 ? 'versión' : 'versiones'} guardadas</span>
            <strong>Última: v{latest.versionNumber} · {latest.name}</strong>
            <span>{latest.status === 'draft' ? 'Borrador' : latest.status === 'sent' ? 'Enviada' : 'Aprobada'}</span>
            <span>{latest.totalHours.toLocaleString('es-CL', { maximumFractionDigits: 2 })} HH</span>
          </div>}
    </Card>
  );
}
