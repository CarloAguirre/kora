import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TeamMember } from '@kora/contracts';
import styles from './HoursApprovalsPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { HourEntriesApprovalTable } from '../components/HourEntriesApprovalTable';
import { TeamAvailabilityHeatmap } from '@/modules/teams/components/TeamAvailabilityHeatmap';
import { TeamContextBar } from '@/modules/teams/components/TeamContextBar';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';

/**
 * Aprobaciones de horas — equivalente a la sección "Horas ingresadas
 * pendientes de aprobación" de `LiderFichaColaborador` en la v1, con una
 * diferencia deliberada: allí había que elegir primero un colaborador; aquí
 * se ve de una vez todo lo que el rol del usuario alcanza a aprobar — la
 * misma consolidación que ya se aplicó al resto de los módulos de la v2.
 *
 * El heatmap "Disponibilidad" cuelga de esta misma pantalla porque en la v1
 * vive junto a la cola de aprobación en `ficha-equipo`, destino del botón
 * "Ver Registro de HH de Equipo" de la consola de equipo del líder.
 *
 * El selector de equipo y el filtro por colaborador viven en `TeamContextBar`
 * (barra pegajosa bajo el título): acotan tanto la disponibilidad como la
 * cola de aprobación de abajo, en vez de un `<select>` aislado en su propia
 * tarjeta que solo alcanzaba al heatmap.
 */
export function HoursApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teamId, setTeamId] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const { data: ledTeams } = useTeamsList(
    user ? { leaderUserId: user.id, pageSize: 50, isActive: true } : { pageSize: 1 },
  );
  const teams = ledTeams?.items ?? [];
  const activeTeamId = teamId || teams[0]?.id || '';

  return (
    <DashboardLayout title="Aprobaciones de horas">
      <div className={styles.page}>
        <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/equipos')}>
          <ChevronLeftIcon size={16} /> Volver a equipos
        </Button>

        <p className={styles.subtitle}>Horas ingresadas pendientes de aprobación.</p>

        {teams.length > 0 && (
          <TeamContextBar
            teams={teams}
            teamId={activeTeamId}
            onTeamChange={(nextTeamId) => {
              setTeamId(nextTeamId);
              setSelectedMember(null);
            }}
            selectedMember={selectedMember}
            onMemberSelect={setSelectedMember}
          />
        )}

        <Card>
          {teams.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>Disponibilidad</h2>
              <TeamAvailabilityHeatmap teamId={activeTeamId} teamMemberId={selectedMember?.id} />
              <div className={styles.divider} />
            </>
          )}

          <h2 className={styles.sectionTitle}>Horas pendientes de aprobación</h2>
          <HourEntriesApprovalTable query={{ teamId: activeTeamId || undefined, userId: selectedMember?.userId }} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
