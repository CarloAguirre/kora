import { Fragment, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { Select } from '@/shared/components/ui/Select';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { ApiRequestError } from '@/shared/lib/api-client';
import { clientProjectPreviewPath } from '@/app/router/paths';
import { PROJECTS_LIST_PATH, RESTORE_PROJECTS_LIST_STATE } from '../lib/projects-list-search';
import { ProjectViewTabs } from '@/modules/client-portal/components/ProjectViewTabs';
import { useProjectDetail, useSetProjectOvertimeAuthorization } from '../api/projects.queries';
import { EditProjectDialog } from '../components/EditProjectDialog';
import { EditDevelopmentProjectDialog } from '../components/EditDevelopmentProjectDialog';
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
  const [quotationTabRequestId, setQuotationTabRequestId] = useState(0);
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
        <PageLoadError error={error} subject="este proyecto" backLabel="Volver a proyectos" onBack={() => void navigate(PROJECTS_LIST_PATH, { state: RESTORE_PROJECTS_LIST_STATE })} />
      </DashboardLayout>
    );
  }

  if (isLoading || !project || !projectId) {
    return (
      <DashboardLayout title="Proyectos">
        <ProjectDetailSkeleton />
      </DashboardLayout>
    );
  }

  /** Puede liderar más de un equipo del proyecto — en ese caso elige cuál ver con el selector de arriba. */
  const ledTeams = project.teams.filter((t) => t.isTeamLeader);
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
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate(PROJECTS_LIST_PATH, { state: RESTORE_PROJECTS_LIST_STATE })}>
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
            quotationTabRequestId={quotationTabRequestId}
            readOnlyTeamIds={isTeamLeaderOnly ? new Set(ledTeams.map((t) => t.teamId)) : undefined}
          />
        )}

        {project.type === 'development'
          ? <EditDevelopmentProjectDialog
              open={editing}
              project={project}
              onClose={() => setEditing(false)}
              onSuccess={(message) => toast.success(message)}
              onViewQuotations={() => {
                setEditing(false);
                setQuotationTabRequestId((previous) => previous + 1);
              }}
              isManagement={can('projects:manage')}
            />
          : <EditProjectDialog
              open={editing}
              project={project}
              onClose={() => setEditing(false)}
              onSuccess={(message) => toast.success(message)}
              isManagement={can('projects:manage')}
            />}
      </div>
    </DashboardLayout>
  );
}

const SKELETON_METRICS = 5;
const SKELETON_TABS = [72, 80, 72, 96];

/**
 * Esqueleto de la ficha mientras carga: misma estructura que la vista real
 * (título, volver, tarjeta de datos, KPIs, pestañas y dos columnas) para que
 * no haya salto cuando llegan los datos. Sirve tanto para desarrollo como soporte.
 */
function ProjectDetailSkeleton() {
  const bar = (extra: string | undefined, style?: CSSProperties) => (
    <span className={[styles.skeletonBar, extra].join(' ')} style={style} />
  );

  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Cargando proyecto">
      <div className={styles.headerBlock}>{bar(styles.skeletonTitle)}</div>

      <div className={styles.topRow}>{bar(styles.skeletonButton)}</div>

      <Card className={styles.infoCard}>
        <div className={styles.skeletonInfoGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={styles.skeletonStack}>
              {bar(styles.skeletonLabel)}
              {bar(styles.skeletonLine, { width: `${60 + ((index * 13) % 30)}%` })}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        {bar(styles.skeletonLine, { width: '40%' })}
        {bar(styles.skeletonProgress)}
        <div className={styles.metricsDivider} />
        <div className={styles.metricsStrip}>
          {Array.from({ length: SKELETON_METRICS }, (_, index) => (
            <div key={index} className={[styles.metricItem, styles.skeletonStack].join(' ')}>
              {bar(styles.skeletonLabel)}
              {bar(styles.skeletonKpi)}
            </div>
          ))}
        </div>
      </Card>

      <div className={styles.tabsShell}>
        <div className={styles.tabsShellBar}>
          {SKELETON_TABS.map((width, index) => (
            <span key={index} className={[styles.tabsShellButton, index === 0 ? styles.tabsShellButtonActive : ''].join(' ')}>
              {bar(styles.skeletonLabel, { width })}
            </span>
          ))}
        </div>
        <div className={styles.tabsShellBody}>
          <div className={styles.layout}>
            <div className={styles.colLeft}>
              <Card>{bar(styles.skeletonBlock, { height: 220 })}</Card>
              <Card>{bar(styles.skeletonBlock, { height: 160 })}</Card>
            </div>
            <div className={styles.colRight}>
              <Card>
                <div className={styles.skeletonStack}>
                  {bar(styles.skeletonLine, { width: '50%' })}
                  {Array.from({ length: 5 }, (_, index) => (
                    <Fragment key={index}>{bar(styles.skeletonLine, { width: `${55 + ((index * 17) % 40)}%` })}</Fragment>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
