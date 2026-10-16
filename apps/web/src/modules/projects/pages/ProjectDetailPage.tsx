import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { Select } from '@/shared/components/ui/Select';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';
import { clientProjectPreviewPath } from '@/app/router/paths';
import { ProjectViewTabs } from '@/modules/client-portal/components/ProjectViewTabs';
import { useProjectDetail, useSetProjectOvertimeAuthorization } from '../api/projects.queries';
import { EditProjectDialog } from '../components/EditProjectDialog';
import { TeamLeaderProjectView } from '../components/TeamLeaderProjectView';
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
  const { can } = usePermissions();
  const { user } = useAuth();
  const toast = useToast();
  const setOvertimeAuthorization = useSetProjectOvertimeAuthorization();
  const { data: project, isLoading, error } = useProjectDetail(projectId ?? null);
  const [editing, setEditing] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

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
    return (
      <DashboardLayout title="Proyectos">
        <PageLoadError error={error} subject="este proyecto" backLabel="Volver a proyectos" onBack={() => void navigate('/proyectos')} />
      </DashboardLayout>
    );
  }

  if (isLoading || !project || !projectId) {
    return (
      <DashboardLayout title="Proyectos">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  /** Puede liderar más de un equipo del proyecto — en ese caso elige cuál ver con el selector de arriba. */
  const ledTeams = user ? project.teams.filter((t) => t.leader?.id === user.id) : [];
  const leaderTeam = ledTeams.find((t) => t.teamId === selectedTeamId) ?? ledTeams[0];
  /**
   * Un líder puede ser a la vez líder de proyecto (o tener `projects:manage`)
   * y líder de uno de los equipos asignados — en ese caso conserva la vista
   * completa (`DevelopmentProjectDetailView`), no la acotada a un solo
   * equipo.
   */
  const isProjectLeader = user !== null && project.leader?.id === user.id;
  const isTeamLeaderOnly = !can('projects:manage') && !isProjectLeader && Boolean(leaderTeam);
  /**
   * Líder de un equipo asignado (sin liderar el proyecto): en desarrollo ve la
   * ficha completa en modo consulta y entra a gestionar su equipo desde su
   * tarjeta de "Equipos asignados" (`ProjectTeamDetailPage`). Soporte no tiene
   * esa ficha de consulta, así que conserva la vista acotada a su equipo.
   */
  const showTeamOnlyView = isTeamLeaderOnly && project.type === 'support';
  /** Sin `projects:manage`, el líder de ESTE proyecto también puede editarlo y cambiar su estado. */
  const canManageProject = can('projects:manage') || isProjectLeader;
  const onEdit = canManageProject ? () => setEditing(true) : undefined;
  /** La vista cliente de soporte es otra pantalla (por contrato, no por proyecto) — solo desarrollo tiene la pestaña. */
  const showViewTabs = !showTeamOnlyView && project.type !== 'support' && project.client !== null && can('clients:read');

  return (
    <DashboardLayout title="Proyectos">
      <div className={styles.page}>
        <div className={styles.headerBlock}>
          <h2 className={styles.title}>{project.name}</h2>
          {showViewTabs && project.client && (
            <ProjectViewTabs active="internal" clientTo={clientProjectPreviewPath(project.client, project)} />
          )}
        </div>

        <div className={styles.topRow}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/proyectos')}>
            <ChevronLeftIcon size={16} /> Volver a proyectos
          </Button>

          {showTeamOnlyView && leaderTeam && ledTeams.length > 1 && (
            <Select
              aria-label="Equipo"
              className={styles.teamSwitcher}
              options={ledTeams.map((t) => ({ value: t.teamId, label: t.teamName }))}
              value={leaderTeam.teamId}
              onChange={(event) => setSelectedTeamId(event.target.value)}
            />
          )}

          {/* Estado y horas extra viven en "Editar proyecto"; este botón queda solo para quien puede autorizar
              horas extra sin poder editar el proyecto (líder de un equipo asignado) — sin él perdería esa acción. */}
          {project.canAuthorizeOvertime && !canManageProject && (
            <Button
              variant="outline"
              size="sm"
              loading={setOvertimeAuthorization.isPending}
              onClick={() => void onToggleOvertime()}
            >
              {project.allowsOvertime ? 'Retirar autorización de horas extra' : 'Autorizar horas extra'}
            </Button>
          )}
        </div>

        {showTeamOnlyView && leaderTeam ? (
          <TeamLeaderProjectView project={project} projectId={projectId} teamId={leaderTeam.teamId} />
        ) : project.type === 'support' ? (
          <SupportProjectDetailView project={project} projectId={projectId} onEdit={onEdit} />
        ) : (
          <DevelopmentProjectDetailView
            project={project}
            projectId={projectId}
            onEdit={onEdit}
            readOnlyTeamIds={isTeamLeaderOnly ? new Set(ledTeams.map((t) => t.teamId)) : undefined}
          />
        )}

        <EditProjectDialog
          open={editing}
          project={project}
          onClose={() => setEditing(false)}
          onSuccess={(message) => toast.success(message)}
          isManagement={can('projects:manage')}
        />
      </div>
    </DashboardLayout>
  );
}
