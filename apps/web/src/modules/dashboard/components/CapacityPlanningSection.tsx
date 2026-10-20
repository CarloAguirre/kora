import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardCapacitySummary } from '@kora/contracts';
import styles from './CapacityPlanningSection.module.css';
import { Card } from '@/shared/components/ui/Card';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { ChevronRightIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { teamPath } from '@/app/router/paths';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

function mondayOf(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface CapacityPlanningSectionProps {
  capacity: DashboardCapacitySummary | null;
  loading: boolean;
  weekStart: string | undefined;
  onWeekStartChange: (weekStart: string) => void;
}

/** "Capacidad y Planificación" — igual disposición que `DashboardProyectos` en la v1, con datos reales de Forecast (M6). */
export function CapacityPlanningSection({ capacity, loading, weekStart, onWeekStartChange }: CapacityPlanningSectionProps) {
  const { can } = usePermissions();
  const selectedMonday = useMemo(() => mondayOf(weekStart ? new Date(`${weekStart}T00:00:00`) : new Date()), [weekStart]);

  const byTeam = capacity?.byTeam ?? [];
  const totalFreeHours = byTeam.reduce((sum, team) => sum + team.freeHours, 0);

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Capacidad y Planificación</span>
        <WeekRangePicker
          label=""
          className={styles.weekSelect}
          periodStart={toIsoDate(selectedMonday)}
          periodEnd={toIsoDate(addDays(selectedMonday, 4))}
          onChange={({ periodStart }) => onWeekStartChange(periodStart)}
        />
      </div>

      <div className={styles.teams}>
        {loading ? (
          <span className={styles.empty}>Cargando capacidad de equipos…</span>
        ) : byTeam.length === 0 ? (
          <span className={styles.empty}>Aún no hay equipos con miembros asignados para mostrar capacidad en este período.</span>
        ) : (
          byTeam.map((team) => {
            const occupancyPercent = team.capacityHours > 0 ? Math.round((team.assignedHours / team.capacityHours) * 100) : 0;
            const availabilityPercent = team.capacityHours > 0 ? Math.round((team.freeHours / team.capacityHours) * 100) : 0;
            const limited = availabilityPercent <= 30;
            const statusLabel = availabilityPercent <= 10 ? 'Saturado' : availabilityPercent <= 30 ? 'Limitado' : 'Disponible';

            return (
              <div key={team.teamId} className={styles.team}>
                <div className={styles.teamHeader}>
                  <div className={styles.teamNameGroup}>
                    {can('teams:read') ? (
                      <Link to={teamPath({ id: team.teamId })} className={styles.teamNameLink}>
                        {team.teamName}
                      </Link>
                    ) : (
                      <span className={styles.teamName}>{team.teamName}</span>
                    )}
                    <span className={[styles.statusBadge, limited ? styles.statusLimited : styles.statusAvailable].join(' ')}>
                      {availabilityPercent}% {statusLabel}
                    </span>
                  </div>
                  <div className={styles.teamStatsGroup}>
                    <span className={styles.teamStats}>
                      {formatHours(team.assignedHours)}/{formatHours(team.capacityHours)} hrs ·{' '}
                      <span className={[styles.freeHours, team.freeHours > 0 ? styles.freeHoursAvailable : styles.freeHoursLimited].join(' ')}>
                        {formatHours(team.freeHours)} hrs libres
                      </span>
                    </span>
                    {can('teams:read') && (
                      <Link to={teamPath({ id: team.teamId })} aria-label={`Ir a ${team.teamName}`} className={styles.teamLinkIcon}>
                        <ChevronRightIcon size={16} />
                      </Link>
                    )}
                  </div>
                </div>
                <div className={styles.track}>
                  <div
                    className={[styles.fill, limited ? styles.fillLimited : styles.fillAvailable].join(' ')}
                    style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.banner}>
        <span>
          Disponibilidad global de los equipos durante el período: <strong>{formatHours(totalFreeHours)} horas libres</strong>
        </span>
      </div>
    </Card>
  );
}
