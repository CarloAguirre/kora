import { useNavigate, useParams } from 'react-router-dom';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useProjectDetail } from '../api/projects.queries';
import { DevelopmentProjectDetailView } from './DevelopmentProjectDetailView';
import { SupportProjectDetailView } from './SupportProjectDetailView';

/**
 * Cascarón de la ficha de proyecto: carga el proyecto y deriva a la vista
 * correspondiente. Desarrollo y soporte son pantallas distintas en la v1
 * (`LiderProyectoFicha` vs `FichaProyectoSoporte`, layouts distintos, no una
 * variación de la misma plantilla) — ver `DevelopmentProjectDetailView` y
 * `SupportProjectDetailView`.
 */
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, error } = useProjectDetail(projectId ?? null);

  if (error) {
    const forbidden = error instanceof ApiRequestError && error.isForbidden;
    return (
      <DashboardLayout title="Proyecto">
        <div className={styles.page}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/proyectos')}>
            <ChevronLeftIcon size={16} /> Volver a proyectos
          </Button>
          <p>{forbidden ? 'No tienes acceso a este proyecto.' : 'No se pudo cargar el proyecto.'}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading || !project || !projectId) {
    return (
      <DashboardLayout title="Proyecto">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={project.name}>
      <div className={styles.page}>
        <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/proyectos')}>
          <ChevronLeftIcon size={16} /> Volver a proyectos
        </Button>

        {project.type === 'support' ? (
          <SupportProjectDetailView project={project} projectId={projectId} />
        ) : (
          <DevelopmentProjectDetailView project={project} projectId={projectId} />
        )}
      </div>
    </DashboardLayout>
  );
}
