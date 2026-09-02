import { useNavigate, useParams } from 'react-router-dom';
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from '@kora/contracts';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useChangeProjectStatus, useProjectDetail } from '../api/projects.queries';
import { DevelopmentProjectDetailView } from './DevelopmentProjectDetailView';
import { SupportProjectDetailView } from './SupportProjectDetailView';

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }));

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
  const { can } = usePermissions();
  const toast = useToast();
  const changeStatus = useChangeProjectStatus();
  const { data: project, isLoading, error } = useProjectDetail(projectId ?? null);

  const onStatusChange = async (status: ProjectStatus) => {
    if (!projectId) return;
    await changeStatus.mutateAsync({ projectId, input: { status } });
    toast.success('Se actualizó el estado del proyecto.');
  };

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
        <div className={styles.topRow}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/proyectos')}>
            <ChevronLeftIcon size={16} /> Volver a proyectos
          </Button>

          {project.type !== 'support' && can('projects:manage') && (
            <Select
              className={styles.statusControl}
              label="Cambiar estado"
              options={STATUS_OPTIONS}
              value={project.status}
              onChange={(event) => void onStatusChange(event.target.value as ProjectStatus)}
            />
          )}
        </div>

        {project.type === 'support' ? (
          <SupportProjectDetailView project={project} projectId={projectId} />
        ) : (
          <DevelopmentProjectDetailView project={project} projectId={projectId} />
        )}
      </div>
    </DashboardLayout>
  );
}
