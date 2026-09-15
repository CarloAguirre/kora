import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { TeamLeaderProjectView } from '../components/TeamLeaderProjectView';
import { useProjectDetail } from '../api/projects.queries';

/**
 * Deep link a un equipo puntual dentro de un proyecto (`Ver equipo` en el
 * tab Resumen de `DevelopmentProjectDetailView`, para quien tiene
 * `projects:manage`). Comparte el mismo panel (`TeamLeaderProjectView`) que
 * `ProjectDetailPage` renderiza automáticamente cuando quien entra a
 * `/proyectos/:id` lidera solo ese equipo — no es una vista distinta.
 */
export function ProjectTeamDetailPage() {
  const { projectId, teamId } = useParams<{ projectId: string; teamId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProjectDetail(projectId ?? null);

  if (isLoading || !project || !projectId || !teamId) {
    return (
      <DashboardLayout title="Equipo">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  const teamName = project.teams.find((t) => t.teamId === teamId)?.teamName ?? 'Equipo';

  return (
    <DashboardLayout title={`${teamName} — ${project.name}`}>
      <Button variant="tertiary" size="sm" onClick={() => void navigate(`/proyectos/${projectId}`)}>
        <ChevronLeftIcon size={16} /> Volver al proyecto
      </Button>
      <TeamLeaderProjectView project={project} projectId={projectId} teamId={teamId} />
    </DashboardLayout>
  );
}
