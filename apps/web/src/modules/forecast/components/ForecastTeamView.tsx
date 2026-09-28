import { useCallback, useMemo, useState } from 'react';
import type { ForecastAssignment, ForecastCapacityMember, TeamSummary } from '@kora/contracts';
import styles from './ForecastLayout.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { useTeamDetail } from '@/modules/teams/api/teams.queries';
import { useForecastAssignments, useForecastCapacity } from '../api/forecast.queries';
import { ForecastKpis, ForecastPlanningSection } from './ForecastPlanning';
import { ForecastMemberEditor } from './ForecastMemberEditor';
import { ForecastHistoryPanel } from './ForecastHistoryPanel';
import { currentLaborWeek, formatShortRange } from '../lib/labor-weeks';

/**
 * Vista editable — réplica de `LiderEquipoForecast` (v1): selector de equipo
 * (si lidera más de uno), historial y edición de asignaciones por
 * colaborador. Usa la misma tabla que la vista de solo lectura, con un botón
 * "Editar" por fila que abre el editor en un modal. Ver
 * docs/DECISION-M6-FORECAST.md.
 */
export function ForecastTeamView({ teams }: { teams: TeamSummary[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const [showHistory, setShowHistory] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const periodLabel = useMemo(
    () => formatShortRange(period.periodStart, period.periodEnd),
    [period.periodStart, period.periodEnd],
  );

  const { data: team, isLoading: teamLoading } = useTeamDetail(teamId || null);
  const { data: assignments } = useForecastAssignments(
    teamId ? { teamId, periodStart: period.periodStart, periodEnd: period.periodEnd } : null,
  );
  const { data: capacity, isLoading: capacityLoading, error } = useForecastCapacity({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });

  // Se parte de los miembros del equipo (no de la respuesta de capacidad) para
  // que un colaborador recién agregado aparezca aunque aún no tenga fila de
  // capacidad: se muestra con su jornada semanal y 0 horas asignadas.
  const members = useMemo<ForecastCapacityMember[]>(() => {
    if (!team) return [];
    const capacityById = new Map((capacity?.members ?? []).filter((m) => m.teamId === teamId).map((m) => [m.teamMemberId, m]));
    return team.members.map(
      (member) =>
        capacityById.get(member.id) ?? {
          teamMemberId: member.id,
          fullName: member.fullName,
          teamId: team.id,
          teamName: team.name,
          capacityHours: member.weeklyHours,
          assignedHours: 0,
          loadPercent: 0,
          items: [],
        },
    );
  }, [team, capacity, teamId]);

  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, ForecastAssignment[]>();
    for (const assignment of assignments ?? []) {
      const list = map.get(assignment.teamMemberId);
      if (list) list.push(assignment);
      else map.set(assignment.teamMemberId, [assignment]);
    }
    return map;
  }, [assignments]);

  const editingMember = editingMemberId ? members.find((member) => member.teamMemberId === editingMemberId) : undefined;

  const renderActions = useCallback(
    (member: ForecastCapacityMember) => (
      <Button variant="outline" size="sm" onClick={() => setEditingMemberId(member.teamMemberId)}>
        Editar
      </Button>
    ),
    [],
  );

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        <div className={styles.header}>
          {teams.length > 1 && (
            <Select
              className={styles.teamField}
              label="Equipo"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            />
          )}
          <WeekRangePicker
            className={styles.periodField}
            periodStart={period.periodStart}
            periodEnd={period.periodEnd}
            onChange={(next) => setPeriod({ ...next, label: '' })}
          />
          <Button variant="outline" onClick={() => setShowHistory(true)}>
            Ver historial
          </Button>
        </div>

        <ForecastKpis members={members} />

        <ForecastPlanningSection
          members={members}
          loading={teamLoading || capacityLoading}
          error={error ? 'No se pudo cargar el forecast.' : null}
          renderActions={renderActions}
        />

        <Modal
          open={Boolean(editingMember)}
          onClose={() => setEditingMemberId(null)}
          title={editingMember?.fullName ?? ''}
          description={
            editingMember
              ? `${periodLabel} · ${editingMember.assignedHours}/${editingMember.capacityHours}h asignadas (${editingMember.loadPercent}%)`
              : undefined
          }
          wide
          footer={<Button onClick={() => setEditingMemberId(null)}>Listo</Button>}
        >
          {editingMember && (
            <ForecastMemberEditor
              member={editingMember}
              assignments={assignmentsByMember.get(editingMember.teamMemberId) ?? []}
              periodStart={period.periodStart}
              periodEnd={period.periodEnd}
            />
          )}
        </Modal>

        <Modal
          open={showHistory}
          onClose={() => setShowHistory(false)}
          title="Historial de cambios"
          description={`${team?.name ?? ''}${team?.name ? ' · ' : ''}${periodLabel}`}
          wide
        >
          {teamId && <ForecastHistoryPanel teamId={teamId} periodStart={period.periodStart} periodEnd={period.periodEnd} />}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
