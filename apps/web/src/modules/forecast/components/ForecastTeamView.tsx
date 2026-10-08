import { useCallback, useMemo, useState } from 'react';
import type { ForecastAssignment, ForecastCapacityMember, TeamSummary } from '@kora/contracts';
import styles from './ForecastLayout.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { useToast } from '@/shared/components/ui/Toast';
import { RefreshIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useTeamDetail } from '@/modules/teams/api/teams.queries';
import { useForecastAssignments, useForecastCapacity, useRecalculateForecast } from '../api/forecast.queries';
import { ForecastKpis, ForecastPlanningSection } from './ForecastPlanning';
import { ForecastMemberEditor } from './ForecastMemberEditor';
import { ForecastHistoryPanel } from './ForecastHistoryPanel';
import { ForecastWeeksGrid } from './ForecastWeeksGrid';
import { currentLaborWeek, formatShortRange, hasWeekStarted, shiftLaborWeek } from '../lib/labor-weeks';

type ViewMode = 'week' | 'weeks';

/** Valor del selector de equipo para "Todos los equipos" (solo admin y PMO). */
const ALL_TEAMS = 'all';

const VIEW_OPTIONS = [
  { value: 'week', label: 'Semana' },
  { value: 'weeks', label: 'Próximas semanas' },
] as const;

/**
 * Vista editable — réplica de `LiderEquipoForecast` (v1): selector de equipo
 * (si lidera más de uno), historial y edición de asignaciones por
 * colaborador. Usa la misma tabla que la vista de solo lectura, con un botón
 * "Editar" por fila que abre el editor en un modal. Ver
 * docs/DECISION-M6-FORECAST.md.
 *
 * Las HH de proyecto se calculan solas desde tramos y tareas; el líder las ajusta en el editor y,
 * si el proyecto cambia después, ve el aviso de ajustes desfasados para decidir.
 *
 * Admin y PMO (`allowAllTeams`) ven todos los equipos, con "Todos los equipos" como opción inicial.
 */
export function ForecastTeamView({ teams, allowAllTeams = false }: { teams: TeamSummary[]; allowAllTeams?: boolean }) {
  const toast = useToast();
  const [teamId, setTeamId] = useState(allowAllTeams ? ALL_TEAMS : (teams[0]?.id ?? ''));
  const allTeams = teamId === ALL_TEAMS;
  const [view, setView] = useState<ViewMode>('week');
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const [showHistory, setShowHistory] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const recalculate = useRecalculateForecast();

  const periodLabel = useMemo(
    () => formatShortRange(period.periodStart, period.periodEnd),
    [period.periodStart, period.periodEnd],
  );

  const { data: team, isLoading: teamLoading } = useTeamDetail(teamId && !allTeams ? teamId : null);
  const { data: capacity, isLoading: capacityLoading, error } = useForecastCapacity({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });

  // Se parte de los miembros del equipo (no de la respuesta de capacidad) para
  // que un colaborador recién agregado aparezca aunque aún no tenga fila de
  // capacidad: se muestra con su jornada semanal y 0 horas asignadas.
  const members = useMemo<ForecastCapacityMember[]>(() => {
    if (allTeams) return capacity?.members ?? [];
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
          deliveries: [],
          containedTasks: [],
          unscheduled: [],
          loggedHours: 0,
        },
    );
  }, [team, capacity, teamId, allTeams]);

  const editingMember = editingMemberId ? members.find((member) => member.teamMemberId === editingMemberId) : undefined;

  // Con "Todos los equipos" las asignaciones se piden del equipo de la persona que se está editando.
  const assignmentsTeamId = allTeams ? (editingMember?.teamId ?? null) : teamId || null;
  const { data: assignments } = useForecastAssignments(
    assignmentsTeamId ? { teamId: assignmentsTeamId, periodStart: period.periodStart, periodEnd: period.periodEnd } : null,
  );

  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, ForecastAssignment[]>();
    for (const assignment of assignments ?? []) {
      const list = map.get(assignment.teamMemberId);
      if (list) list.push(assignment);
      else map.set(assignment.teamMemberId, [assignment]);
    }
    return map;
  }, [assignments]);

  const staleMembers = useMemo(() => members.filter((member) => member.items.some((item) => item.isStale)), [members]);
  const staleCount = useMemo(
    () => members.reduce((total, member) => total + member.items.filter((item) => item.isStale).length, 0),
    [members],
  );

  const renderActions = useCallback(
    (member: ForecastCapacityMember) => (
      <Button variant="outline" size="sm" onClick={() => setEditingMemberId(member.teamMemberId)}>
        Editar
      </Button>
    ),
    [],
  );

  const openWeekOf = useCallback((teamMemberId: string, periodStart: string) => {
    const week = shiftLaborWeek(periodStart, 0);
    setPeriod(week);
    setView('week');
    setEditingMemberId(teamMemberId);
  }, []);

  const handleRecalculate = () =>
    recalculate.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(`Forecast recalculado desde ${result.segments} tramos y ${result.tasks} tareas. Tus ajustes se mantienen.`),
      onError: (cause) =>
        toast.error(cause instanceof ApiRequestError ? cause.payload.message : 'No se pudo recalcular el forecast.'),
    });

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        <div className={styles.header}>
          <SegmentedControl
            aria-label="Vista"
            options={VIEW_OPTIONS}
            value={view}
            onChange={(value) => setView(value as ViewMode)}
          />
          <div className={styles.headerFields}>
            {(teams.length > 1 || allowAllTeams) && (
              <Select
                className={styles.teamField}
                label="Equipo"
                options={[
                  ...(allowAllTeams ? [{ value: ALL_TEAMS, label: 'Todos los equipos' }] : []),
                  ...teams.map((t) => ({ value: t.id, label: t.name })),
                ]}
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
              />
            )}
            {view === 'week' && (
              <WeekRangePicker
                className={styles.periodField}
                periodStart={period.periodStart}
                periodEnd={period.periodEnd}
                onChange={(next) => setPeriod({ ...next, label: '' })}
              />
            )}
            {!allTeams && (
              <Button variant="outline" onClick={() => setShowHistory(true)}>
                Ver historial
              </Button>
            )}
          </div>
        </div>

        <div className={styles.sourceNote}>
          <span>
            Las horas de proyecto se calculan desde los tramos del Roadmap y las tareas con HH estimadas. Puedes ajustarlas en
            “Editar”; tus ajustes no se pierden cuando el proyecto cambia.
          </span>
          <Button variant="ghost" size="sm" iconLeft={<RefreshIcon size={14} />} loading={recalculate.isPending} onClick={handleRecalculate}>
            Recalcular desde proyectos
          </Button>
        </div>

        {view === 'week' && staleCount > 0 && (
          <div className={styles.staleBanner} role="status">
            <TriangleAlertIcon size={18} />
            <span>
              <strong>
                {staleCount === 1 ? '1 ajuste quedó desfasado' : `${staleCount} ajustes quedaron desfasados`}
              </strong>{' '}
              esta semana: el proyecto cambió después de que se ajustaran. Revisa si mantienes tu valor o usas el nuevo cálculo.
            </span>
            {staleMembers[0] && (
              <Button variant="outline" size="sm" onClick={() => setEditingMemberId(staleMembers[0]!.teamMemberId)}>
                Revisar
              </Button>
            )}
          </div>
        )}

        {view === 'week' ? (
          <>
            <ForecastKpis members={members} />

            <ForecastPlanningSection
              members={members}
              loading={(!allTeams && teamLoading) || capacityLoading}
              error={error ? 'No se pudo cargar el forecast.' : null}
              renderActions={renderActions}
              showLogged={hasWeekStarted(period.periodStart)}
            />
          </>
        ) : (
          <ForecastWeeksGrid teamId={allTeams ? undefined : teamId} onSelectCell={openWeekOf} />
        )}

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
          {teamId && !allTeams && <ForecastHistoryPanel teamId={teamId} periodStart={period.periodStart} periodEnd={period.periodEnd} />}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
