import { useState } from 'react';
import styles from './HoursApprovalsPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { HourEntriesApprovalTable } from '../components/HourEntriesApprovalTable';
import { TeamAvailabilityHeatmap } from '@/modules/teams/components/TeamAvailabilityHeatmap';
import { TeamMembersCard } from '@/modules/teams/components/TeamMembersCard';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';

/**
 * Aprobaciones de horas — equivalente a la sección "Horas ingresadas
 * pendientes de aprobación" de `LiderFichaColaborador` en la v1, con una
 * diferencia deliberada: allí había que elegir primero un colaborador; aquí
 * se ve de una vez todo lo que el rol del usuario alcanza a aprobar — la
 * misma consolidación que ya se aplicó al resto de los módulos de la v2.
 *
 * "Colaboradores equipo X" y el heatmap "Disponibilidad" cuelgan de esta
 * misma pantalla porque en la v1 viven junto a la cola de aprobación en
 * `ficha-equipo`, destino del botón "Ver Registro de HH de Equipo" de la
 * consola de equipo del líder — ahí también empieza con la sección
 * "Colaboradores", no solo en el dashboard principal.
 */
export function HoursApprovalsPage() {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState('');
  const { data: ledTeams } = useTeamsList(
    user ? { leaderUserId: user.id, pageSize: 50, isActive: true } : { pageSize: 1 },
  );
  const teams = ledTeams?.items ?? [];
  const activeTeamId = teamId || teams[0]?.id || '';

  return (
    <DashboardLayout title="Aprobaciones de horas">
      <div className={styles.page}>
        <p className={styles.subtitle}>Horas ingresadas pendientes de aprobación.</p>

        {teams.length > 0 && <TeamMembersCard teams={teams} teamId={activeTeamId} onTeamChange={setTeamId} />}

        {teams.length > 0 && (
          <Card>
            <h2 className={styles.sectionTitle}>Disponibilidad</h2>
            <TeamAvailabilityHeatmap teamId={activeTeamId} />
          </Card>
        )}

        <Card>
          <HourEntriesApprovalTable query={{}} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
