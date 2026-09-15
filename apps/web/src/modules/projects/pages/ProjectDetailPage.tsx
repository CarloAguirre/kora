import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from '@kora/contracts';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { ChevronLeftIcon, PencilIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useChangeProjectStatus, useProjectDetail, useSetProjectOvertimeAuthorization } from '../api/projects.queries';
import { EditProjectDialog } from '../components/EditProjectDialog';
import { TeamLeaderProjectView } from '../components/TeamLeaderProjectView';
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
  const { user } = useAuth();
  const toast = useToast();
  const changeStatus = useChangeProjectStatus();
  const setOvertimeAuthorization = useSetProjectOvertimeAuthorization();
  const { data: project, isLoading, error } = useProjectDetail(projectId ?? null);
  const [editing, setEditing] = useState(false);

  const onStatusChange = async (status: ProjectStatus) => {
    if (!projectId) return;
    await changeStatus.mutateAsync({ projectId, input: { status } });
    toast.success('Se actualizó el estado del proyecto.');
  };

  const onToggleOvertime = async () => {
    if (!projectId || !project) return;
    try {
      await setOvertimeAuthorization.mutateAsync({ projectId, input: { allowsOvertime: !project.allowsOvertime } });
      toast.success(
        project.allowsOvertime ? 'Se retiró la autorización de horas extra.' : 'Se autorizaron horas extra para este proyecto.',
      );
    } catch (toggleError) {
      toast.error(
        toggleError instanceof ApiRequestError ? toggleError.message : 'No se pudo actualizar la autorización de horas extra.',
      );
    }
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

  const leaderTeam = !can('projects:manage') && user ? project.teams.find((t) => t.leader?.id === user.id) : undefined;

  return (
    <DashboardLayout title={project.name}>
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/proyectos')}>
            <ChevronLeftIcon size={16} /> Volver a proyectos
          </Button>

          <div className={styles.topRowActions}>
            {can('projects:manage') && (
              <Button variant="outline" size="sm" iconLeft={<PencilIcon size={16} />} onClick={() => setEditing(true)}>
                Editar proyecto
              </Button>
            )}

            {project.canAuthorizeOvertime && (
              <Button
                variant="outline"
                size="sm"
                loading={setOvertimeAuthorization.isPending}
                onClick={() => void onToggleOvertime()}
              >
                {project.allowsOvertime ? 'Retirar autorización de horas extra' : 'Autorizar horas extra'}
              </Button>
            )}

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
        </div>

        {leaderTeam ? (
          <TeamLeaderProjectView project={project} projectId={projectId} teamId={leaderTeam.teamId} />
        ) : project.type === 'support' ? (
          <SupportProjectDetailView project={project} projectId={projectId} />
        ) : (
          <DevelopmentProjectDetailView project={project} projectId={projectId} />
        )}

        <EditProjectDialog
          open={editing}
          project={project}
          onClose={() => setEditing(false)}
          onSuccess={(message) => toast.success(message)}
        />
      </div>
    </DashboardLayout>
  );
}
