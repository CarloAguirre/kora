import { useMemo, useState } from 'react';
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
import { useHourEntriesList } from '../api/hours.queries';

/** Muestra de pendientes para elegir el equipo por defecto (máximo que acepta la API). */
const DEFAULT_TEAM_SAMPLE_SIZE = 200;

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

  // Sin equipo elegido se abre el que tiene más horas pendientes, no el primero
  // de la lista: se llega desde "N registros por aprobar" (campanita, Dashboard)
  // y abrir un equipo sin pendientes mostraba la cola vacía.
  const choosingDefault = !teamId && teams.length > 1;
  const { data: pendingSample } = useHourEntriesList(
    { status: 'pending', pageSize: DEFAULT_TEAM_SAMPLE_SIZE },
    { enabled: choosingDefault },
  );
  const busiestTeamId = useMemo(() => {
    const ledTeamIds = new Set(teams.map((team) => team.id));
    const pendingByTeam = new Map<string, number>();
    for (const entry of pendingSample?.items ?? []) {
      if (entry.team && ledTeamIds.has(entry.team.id)) {
        pendingByTeam.set(entry.team.id, (pendingByTeam.get(entry.team.id) ?? 0) + 1);
      }
    }
    return [...pendingByTeam].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [pendingSample, teams]);
  const activeTeamId = teamId || busiestTeamId || teams[0]?.id || '';
  const resolvingDefaultTeam = choosingDefault && !pendingSample;

  // Se llega tanto desde "Equipos" como desde el card de Aprobaciones Pendientes
  // del dashboard, así que no hay un único destino fijo al que volver: se usa
  // el historial del navegador y solo se cae a "Equipos" si no hay de dónde volver
  // (p.ej. la página se abrió directo desde un enlace).
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const goBack = () => (canGoBack ? navigate(-1) : navigate('/equipos'));

  return (
    <DashboardLayout title="Aprobaciones de horas">
      <div className={styles.page}>
        <Button variant="tertiary" size="sm" className={styles.backButton} onClick={goBack}>
          <ChevronLeftIcon size={16} /> Volver
        </Button>

        {teams.length > 0 && !resolvingDefaultTeam && (
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
          <h2 className={styles.sectionTitle}>Horas pendientes de aprobación</h2>
          {/* Mientras se elige el equipo por defecto no se pinta nada: evita cargar primero el equipo equivocado. */}
          {!resolvingDefaultTeam && (
            <>
              {teams.length > 0 && (
                <>
                  <TeamAvailabilityHeatmap teamId={activeTeamId} teamMemberId={selectedMember?.id} />
                  <div className={styles.divider} />
                </>
              )}

              <HourEntriesApprovalTable query={{ teamId: activeTeamId || undefined, userId: selectedMember?.userId }} />
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
