import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { LeaderTeamConsole } from './LeaderTeamConsole';
import { useTeamDetail, useTeamsList } from '../api/teams.queries';

/**
 * `/equipos/:teamId/vista-lider`: "Vista líder" desde la administración de
 * equipos. Muestra la consola de `/equipos` tal como la ve el líder del equipo
 * — con los mismos equipos en el selector (misma consulta que
 * `TeamsListPage` para el rol `leader`) — abierta en este equipo.
 */
export function TeamLeaderPreviewPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { data: team, isLoading, error } = useTeamDetail(teamId ?? null);
  const leaderUserId = team?.leader?.id;
  const { data: ledTeams, isLoading: loadingLedTeams } = useTeamsList(
    { leaderUserId, pageSize: 50, isActive: true },
    { enabled: Boolean(leaderUserId) },
  );

  if (error) {
    return (
      <DashboardLayout title="Equipos">
        <PageLoadError error={error} subject="este equipo" backLabel="Volver a equipos" onBack={() => void navigate('/equipos')} />
      </DashboardLayout>
    );
  }

  if (isLoading || !team || (leaderUserId && loadingLedTeams)) {
    return (
      <DashboardLayout title="Equipos">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  if (!leaderUserId) {
    return (
      <DashboardLayout title="Equipos">
        <p>Este equipo no tiene líder asignado, así que no hay una vista de líder que mostrar.</p>
      </DashboardLayout>
    );
  }

  // Un equipo inactivo no aparece en la consola del líder; se agrega igual para poder previsualizarlo.
  const teams = ledTeams?.items ?? [];
  const consoleTeams = teams.some((t) => t.id === team.id) ? teams : [team, ...teams];

  return <LeaderTeamConsole teams={consoleTeams} preview={{ leaderUserId, teamId: team.id }} />;
}
