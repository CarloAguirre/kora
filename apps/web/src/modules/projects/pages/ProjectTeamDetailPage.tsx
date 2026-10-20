import { useNavigate, useParams } from 'react-router-dom';
import styles from './ProjectDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { Select } from '@/shared/components/ui/Select';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { TeamLeaderProjectView } from '../components/TeamLeaderProjectView';
import { useProjectDetail } from '../api/projects.queries';
import { projectPath, projectTeamPath } from '@/app/router/paths';
import { projectsListPath } from '../lib/projects-list-search';

/**
 * Deep link a un equipo puntual dentro de un proyecto. Dos entradas:
 * `Ver equipo` en el tab Resumen de `DevelopmentProjectDetailView` (para
 * quien tiene `projects:manage`), y el "Reporte de equipo" de
 * `LeaderTeamConsole` (`/equipos`) — así un líder que también lidera el
 * proyecto completo sigue viendo el panel acotado a su equipo al entrar
 * desde Equipos, en vez de la ficha admin que vería entrando desde
 * Proyectos. También es adonde lleva la tarjeta de su equipo en "Equipos
 * asignados" cuando un líder de equipo abre `/proyectos/:id` (que en
 * desarrollo le muestra la ficha completa en modo consulta). Comparte el panel
 * (`TeamLeaderProjectView`) con la vista acotada de soporte en `ProjectDetailPage`.
 */
export function ProjectTeamDetailPage() {
  const { projectId, teamId } = useParams<{ projectId: string; teamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: project, isLoading, error } = useProjectDetail(projectId ?? null);

  if (error) {
    return (
      <DashboardLayout title="Equipo">
        <PageLoadError error={error} subject="este proyecto" backLabel="Volver a proyectos" onBack={() => void navigate(projectsListPath())} />
      </DashboardLayout>
    );
  }

  if (isLoading || !project || !projectId || !teamId) {
    return (
      <DashboardLayout title="Equipo">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  /** `projectTeamPath` arma la URL con el slug del equipo; la vista trabaja con el UUID. */
  const teamRow = project.teams.find((t) => t.teamId === teamId || t.teamSlug === teamId);
  const teamName = teamRow?.teamName ?? 'Equipo';
  /** Si quien entra lidera más de un equipo del proyecto, puede saltar entre ellos sin volver a la ficha. */
  const ledTeams = user ? project.teams.filter((t) => t.leader?.id === user.id) : [];
  const showTeamSwitcher = ledTeams.length > 1 && ledTeams.some((t) => t.teamId === teamRow?.teamId);

  return (
    <DashboardLayout title={`${teamName} — ${project.name}`}>
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate(projectPath(project))}>
            <ChevronLeftIcon size={16} /> Volver al proyecto
          </Button>
          {showTeamSwitcher && teamRow && (
            <Select
              aria-label="Equipo"
              className={styles.teamSwitcher}
              options={ledTeams.map((t) => ({ value: t.teamId, label: t.teamName }))}
              value={teamRow.teamId}
              onChange={(event) => {
                const next = ledTeams.find((t) => t.teamId === event.target.value);
                if (next) void navigate(projectTeamPath(project, { id: next.teamId, slug: next.teamSlug }));
              }}
            />
          )}
        </div>
        <TeamLeaderProjectView project={project} projectId={projectId} teamId={teamRow?.teamId ?? teamId} />
      </div>
    </DashboardLayout>
  );
}
