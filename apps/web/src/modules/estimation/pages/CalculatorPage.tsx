import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { projectQuotationPath } from '@/app/router/paths';
import {
  PROJECT_SALES_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  isQuotationDraftEligibleProject,
  type ProjectSummary,
} from '@kora/contracts';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { TextField } from '@/shared/components/ui/TextField';
import { SearchIcon } from '@/shared/components/icons/Icons';
import { NewEstimationModal } from '../components/NewEstimationModal';
import styles from './CalculatorPage.module.css';

const formatHours = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const isVisibleProject = (project: ProjectSummary) =>
  project.type === 'development' &&
  (project.salesStage === 'prospect' || project.salesStage === 'quoted' || project.salesStage === 'approved') &&
  project.status !== 'cancelled';

const isQuotationProspect = (project: ProjectSummary) =>
  isQuotationDraftEligibleProject(project);

export function CalculatorPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [newEstimationOpen, setNewEstimationOpen] = useState(false);
  const { data, isLoading, error } = useProjectsList({
    type: 'development',
    page: 1,
    pageSize: 200,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  const sourceProjects = data?.items ?? [];
  const canQuote = (project: ProjectSummary) => can('projects:manage') || project.leader?.id === user?.id;

  const projects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-CL');
    return sourceProjects
      .filter(isVisibleProject)
      .filter((project) => {
        if (!term) return true;
        return `${project.name} ${project.client?.companyName ?? ''}`
          .toLocaleLowerCase('es-CL')
          .includes(term);
      });
  }, [search, sourceProjects]);

  const prospects = useMemo(
    () => sourceProjects.filter((project) => isQuotationProspect(project) && canQuote(project)),
    [sourceProjects, user?.id, can],
  );

  return (
    <DashboardLayout title="Calculadora">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Estimación de proyectos</span>
            <h1>Calculadora</h1>
            <p>
              Administra borradores comerciales versionados y mantén visibles los
              proyectos vigentes como referencia, sin modificar todavía sus HH operativas.
            </p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.pocBadge}>Cotizaciones</span>
            <Button onClick={() => setNewEstimationOpen(true)}>+ Nueva estimación</Button>
          </div>
        </header>

        <Card className={styles.toolbar}>
          <TextField
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente o proyecto"
            iconLeft={<SearchIcon size={16} />}
            aria-label="Buscar proyectos"
          />
          <div className={styles.toolbarNote}>
            La cotización manual se guarda como versión en PostgreSQL. La opción IA continúa como PoC separada.
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
                    <th>Cotización</th>
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
                      <td>{canQuote(project) ? <Link to={projectQuotationPath(project)}>Ver versiones</Link> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <NewEstimationModal
        open={newEstimationOpen}
        prospects={prospects}
        onClose={() => setNewEstimationOpen(false)}
      />
    </DashboardLayout>
  );
}
