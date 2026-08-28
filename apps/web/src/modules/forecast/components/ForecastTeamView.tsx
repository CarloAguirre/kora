import { useMemo, useState } from 'react';
import type { ForecastAssignment, TeamSummary } from '@kora/contracts';
import styles from './ForecastTeamView.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { useTeamDetail } from '@/modules/teams/api/teams.queries';
import { useForecastAssignments, useForecastCapacity } from '../api/forecast.queries';
import { ForecastMemberCard, type ForecastMemberCardMember } from './ForecastMemberCard';
import { ForecastHistoryPanel } from './ForecastHistoryPanel';
import { buildLaborWeeks, currentLaborWeek } from '../lib/labor-weeks';

const WEEKS = buildLaborWeeks();

/**
 * Vista editable — réplica de `LiderEquipoForecast` (v1): tarjetas por
 * colaborador, selector de equipo (si lidera más de uno) y panel de
 * historial. Ver docs/DECISION-M6-FORECAST.md.
 */
export function ForecastTeamView({ teams }: { teams: TeamSummary[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const [showHistory, setShowHistory] = useState(false);

  const periodLabel = useMemo(
    () =>
      WEEKS.find((week) => week.periodStart === period.periodStart && week.periodEnd === period.periodEnd)?.label ??
      `${period.periodStart} – ${period.periodEnd}`,
    [period.periodStart, period.periodEnd],
  );

  const { data: team } = useTeamDetail(teamId || null);
  const { data: assignments } = useForecastAssignments(
    teamId ? { teamId, periodStart: period.periodStart, periodEnd: period.periodEnd } : null,
  );
  const { data: capacity } = useForecastCapacity({ periodStart: period.periodStart, periodEnd: period.periodEnd });

  const capacityByMember = useMemo(() => {
    const map = new Map<string, { capacityHours: number; assignedHours: number }>();
    for (const member of capacity?.members ?? []) {
      if (member.teamId === teamId) map.set(member.teamMemberId, member);
    }
    return map;
  }, [capacity, teamId]);

  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, ForecastAssignment[]>();
    for (const assignment of assignments ?? []) {
      const list = map.get(assignment.teamMemberId);
      if (list) list.push(assignment);
      else map.set(assignment.teamMemberId, [assignment]);
    }
    return map;
  }, [assignments]);

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        <div className={styles.filters}>
          {teams.length > 1 && (
            <Select
              className={styles.teamField}
              label="Equipo"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            />
          )}
          <Select
            className={styles.periodField}
            label="Período"
            options={WEEKS.map((week) => ({ value: `${week.periodStart}|${week.periodEnd}`, label: week.label }))}
            value={`${period.periodStart}|${period.periodEnd}`}
            onChange={(event) => {
              const [periodStart, periodEnd] = event.target.value.split('|');
              setPeriod({ periodStart: periodStart!, periodEnd: periodEnd!, label: '' });
            }}
          />
          <Button variant="tertiary" size="sm" className={styles.historyToggle} onClick={() => setShowHistory(true)}>
            Ver historial
          </Button>
        </div>

        <div className={styles.cards}>
          {(team?.members ?? []).length === 0 && <p className={styles.empty}>Este equipo no tiene colaboradores activos.</p>}

          {(team?.members ?? []).map((member) => {
            const capacityInfo = capacityByMember.get(member.id);
            const memberForCard: ForecastMemberCardMember = {
              teamMemberId: member.id,
              fullName: member.fullName,
              capacityHours: capacityInfo?.capacityHours ?? member.weeklyHours,
              assignedHours: capacityInfo?.assignedHours ?? 0,
            };

            return (
              <ForecastMemberCard
                key={member.id}
                member={memberForCard}
                assignments={assignmentsByMember.get(member.id) ?? []}
                periodStart={period.periodStart}
                periodEnd={period.periodEnd}
                canEdit
              />
            );
          })}
        </div>

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
