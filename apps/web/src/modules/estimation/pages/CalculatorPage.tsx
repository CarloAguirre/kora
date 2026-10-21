import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PROJECT_SALES_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectSummary,
} from '@kora/contracts';
import { projectEstimationPath } from '@/app/router/paths';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon } from '@/shared/components/icons/Icons';
import styles from './CalculatorPage.module.css';

const formatHours = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const isEstimable = (project: ProjectSummary) =>
  project.type === 'development' &&
  (project.salesStage === 'quoted' || project.salesStage === 'approved') &&
  project.status !== 'cancelled';

export function CalculatorPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useProjectsList({
    type: 'development',
    page: 1,
    pageSize: 200,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  const projects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-CL');
    return (data?.items ?? [])
      .filter(isEstimable)
      .filter((project) => {
        if (!term) return true;
        return `${project.name} ${project.client?.companyName ?? ''}`
          .toLocaleLowerCase('es-CL')
          .includes(term);
      });
  }, [data?.items, search]);

  return (
    <DashboardLayout title="Calculadora">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Estimación de proyectos</span>
            <h1>Calculadora</h1>
            <p>
              Estima HH, equipo y supuestos para proyectos de desarrollo. La PoC reutiliza los
              proyectos reales de Kora y replica el flujo principal del prototipo HTML.
            </p>
          </div>
          <span className={styles.pocBadge}>PoC</span>
        </header>

        <Card className={styles.toolbar}>
          <TextField
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente o proyecto"
            iconLeft={<SearchIcon size={16} />}
            aria-label="Buscar proyectos para estimar"
          />
          <div className={styles.toolbarNote}>
            Se muestran proyectos en <strong>Cotización</strong> o <strong>Aprobado</strong>.
          </div>
        </Card>

        <Card className={styles.tableCard}>
          {isLoading && <div className={styles.state}>Cargando proyectos…</div>}
          {error && <div className={styles.state}>No se pudieron cargar los proyectos.</div>}
          {!isLoading && !error && projects.length === 0 && (
            <div className={styles.state}>No hay proyectos que coincidan con el filtro.</div>
          )}

          {!isLoading && !error && projects.length > 0 && (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Prospecto / proyecto</th>
                    <th>Etapa</th>
                    <th>Estado</th>
                    <th className={styles.numeric}>HH actuales</th>
                    <th>Líder</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id}>
                      <td>{project.client?.companyName ?? 'Cliente por confirmar'}</td>
                      <td>
                        <strong className={styles.projectName}>{project.name}</strong>
                        <span className={styles.projectMeta}>
                          {project.salesStage
                            ? PROJECT_SALES_STAGE_LABELS[project.salesStage]
                            : 'Sin etapa comercial'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.stageBadge}>
                          {project.salesStage
                            ? PROJECT_SALES_STAGE_LABELS[project.salesStage]
                            : '—'}
                        </span>
                      </td>
                      <td>{PROJECT_STATUS_LABELS[project.status]}</td>
                      <td className={styles.numeric}>{formatHours(project.soldHours)}</td>
                      <td>{project.leader?.fullName ?? 'Sin asignar'}</td>
                      <td className={styles.actionCell}>
                        <Link className={styles.actionLink} to={projectEstimationPath(project)}>
                          Estimar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
