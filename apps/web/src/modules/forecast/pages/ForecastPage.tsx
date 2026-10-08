import { isAdminTier } from '@kora/contracts';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { ForecastTeamView } from '../components/ForecastTeamView';
import { ForecastCapacityView } from '../components/ForecastCapacityView';

/**
 * La v1 tiene dos pantallas (`Forecast` de solo lectura y
 * `LiderEquipoForecast` editable) elegidas por rol dentro del router. Aquí es
 * una sola ruta: admin y PMO ven y editan el forecast de todos los equipos;
 * quien lidera al menos un equipo y puede administrar el forecast ve la vista
 * editable de su(s) equipo(s); el resto ve el resumen de solo lectura — ver
 * docs/DECISION-M6-FORECAST.md.
 */
export function ForecastPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const managesAllTeams = Boolean(user && isAdminTier(user.role) && can('forecast:manage'));
  const { data: ledTeams, isLoading } = useTeamsList(
    user
      ? managesAllTeams
        ? { pageSize: 100, isActive: true }
        : { leaderUserId: user.id, pageSize: 50, isActive: true }
      : { pageSize: 1 },
  );

  if (isLoading) {
    return (
      <DashboardLayout title="Forecast">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  if (managesAllTeams) return <ForecastTeamView teams={ledTeams?.items ?? []} allowAllTeams />;

  const canManageOwnTeam = can('forecast:manage') && (ledTeams?.items.length ?? 0) > 0;
  if (canManageOwnTeam) return <ForecastTeamView teams={ledTeams!.items} />;

  return <ForecastCapacityView />;
}
