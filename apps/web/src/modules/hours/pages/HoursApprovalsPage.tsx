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
import { useHourEntriesList, useTeamsPendingCounts } from '../api/hours.queries';

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

  // Pendientes por equipo con el mismo criterio que la campanita. Sin equipo
  // elegido se abre el que tiene más, no el primero de la lista: se llega desde
  // "N registros por aprobar" (campanita, Dashboard) y abrir un equipo sin
  // pendientes mostraba la cola vacía.
  const multipleTeams = teams.length > 1;
  const pendingByTeam = useTeamsPendingCounts(
    teams.map((team) => team.id),
    { enabled: multipleTeams },
  );
  const busiestTeamId = [...(pendingByTeam ?? [])].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  // Se fija al resolverse (ajuste en render, sin efecto): si no, al aprobar
  // parte del equipo abierto otro pasaba a ser "el más cargado" y la cola
  // saltaba de equipo a mitad del trabajo.
  if (!teamId && busiestTeamId) setTeamId(busiestTeamId);
  const activeTeamId = teamId || busiestTeamId || teams[0]?.id || '';
  const resolvingDefaultTeam = !teamId && multipleTeams && !pendingByTeam;
  // La cola muestra un equipo a la vez: sin este aviso, al vaciar el equipo
  // abierto la campanita seguía contando los de los otros y parecía un error.
  const otherTeamsWithPending = teams.filter((team) => team.id !== activeTeamId && (pendingByTeam?.get(team.id) ?? 0) > 0);
  const selectTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId);
    setSelectedMember(null);
  };

  // Lo que le toca aprobar al líder pero no cae en ninguno de sus equipos (p.ej.
  // soporte de otro equipo en un proyecto que lidera): la cola por equipo no lo
  // muestra y la campanita seguía contándolo sin que hubiera dónde aprobarlo.
  const showOutsideTeams = user?.role === 'leader' && teams.length > 0;
  const { data: outsideTeamsSample } = useHourEntriesList(
    { status: 'pending', outsideLedTeams: true, pageSize: 1 },
    { enabled: showOutsideTeams },
  );
  const hasOutsideTeamsEntries = showOutsideTeams && (outsideTeamsSample?.total ?? 0) > 0;

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
            onTeamChange={selectTeam}
            selectedMember={selectedMember}
            onMemberSelect={setSelectedMember}
          />
        )}

        <Card>
          <h2 className={styles.sectionTitle}>Horas pendientes de aprobación</h2>
          {!resolvingDefaultTeam && otherTeamsWithPending.length > 0 && (
            <div className={styles.otherTeams}>
              <span>También tienes horas por aprobar en:</span>
              {otherTeamsWithPending.map((team) => (
                <Button key={team.id} variant="outline" size="sm" onClick={() => selectTeam(team.id)}>
                  {team.name} ({pendingByTeam?.get(team.id)})
                </Button>
              ))}
            </div>
          )}
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

        {hasOutsideTeamsEntries && (
          <Card>
            <h2 className={styles.sectionTitle}>Otros registros que te toca aprobar</h2>
            <p className={styles.sectionHint}>De colaboradores fuera de tus equipos, en proyectos que lideras.</p>
            <HourEntriesApprovalTable query={{ outsideLedTeams: true }} />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
