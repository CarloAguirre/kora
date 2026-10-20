import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TeamSummary } from '@kora/contracts';
import styles from './LeaderTeamConsole.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { ClockIcon } from '@/shared/components/icons/Icons';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { TeamHourHistoryPanel } from '@/modules/hours/components/TeamHourHistoryPanel';
import { TeamContextBar } from '../components/TeamContextBar';
import { TeamReport } from '../components/TeamReport';
import { useTeamDetail } from '../api/teams.queries';

/**
 * Consola del líder para su(s) equipo(s) — reemplaza la vista de administración
 * de equipos que veía un líder en `/equipos` (una tabla global de equipos que
 * no le pertenecía) por el equivalente de `LiderEquiposPM`/`LiderDashboardB`
 * en la v1: `TeamContextBar` (selector de equipo + filtro por colaborador),
 * el "Reporte de equipo" (`TeamReport`: HH del equipo por proyecto y persona,
 * con período, avisos de datos faltantes y comentarios del líder), y
 * "Registro de horas Líder": alta de horas propias + historial de TODO el
 * equipo (autor, equipo, filtros de persona/fecha/estado), igual que
 * `LiderDashboardB` en la v1. La aprobación de HH del equipo tiene pantalla
 * propia en v2 (`/horas/aprobaciones`) — aquí solo se enlaza en vez de
 * reconstruirla. La capacidad semanal vive en Forecast, ya accesible desde el
 * menú lateral.
 */
export function LeaderTeamConsole({ teams }: { teams: TeamSummary[] }) {
  const { user } = useAuth();
  // La lista incluye equipos que el usuario lidera solo en algún proyecto, pero
  // el Reporte de equipo es del líder oficial: se abre primero uno de esos.
  const [teamId, setTeamId] = useState(
    () => teams.find((team) => team.leader?.id === user?.id)?.id ?? teams[0]?.id ?? '',
  );
  const activeTeam = teams.find((t) => t.id === teamId) ?? { id: teamId };
  // Un solo filtro de colaborador para la barra de contexto, el reporte y el historial.
  const [memberUserId, setMemberUserId] = useState('');
  const { data: teamDetail } = useTeamDetail(teamId || null);
  const selectedMember = teamDetail?.members.find((member) => member.userId === memberUserId) ?? null;

  return (
    <DashboardLayout title="Equipos">
      <div className={styles.page}>
        <TeamContextBar
          teams={teams}
          teamId={teamId}
          onTeamChange={(nextTeamId) => {
            setTeamId(nextTeamId);
            setMemberUserId('');
          }}
          selectedMember={selectedMember}
          onMemberSelect={(member) => setMemberUserId(member?.userId ?? '')}
          actions={
            <Link to="/horas/aprobaciones">
              <Button size="sm" iconLeft={<ClockIcon size={15} />}>
                Aprobación de HH
              </Button>
            </Link>
          }
        />

        {teamId && (
          <TeamReport
            key={teamId}
            team={activeTeam}
            currentUserId={user?.id}
            memberUserId={memberUserId}
            onMemberChange={setMemberUserId}
          />
        )}

        <Card>
          <TeamHourHistoryPanel teamId={teamId || undefined} userId={memberUserId || undefined} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
