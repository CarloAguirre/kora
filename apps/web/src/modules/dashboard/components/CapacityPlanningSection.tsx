import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardCapacitySummary } from '@kora/contracts';
import styles from './CapacityPlanningSection.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { ChevronRightIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';

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

function formatRangeDDMMYY(start: Date, end: Date): string {
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  return `${fmt(start)} - ${fmt(end)}`;
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

  const weekOptions = useMemo(
    () =>
      Array.from({ length: 13 }, (_, index) => {
        const offset = index - 6;
        const monday = mondayOf(addDays(selectedMonday, offset * 7));
        const friday = addDays(monday, 4);
        return { value: toIsoDate(monday), label: formatRangeDDMMYY(monday, friday) };
      }),
    [selectedMonday],
  );

  const byTeam = capacity?.byTeam ?? [];
  const totalFreeHours = byTeam.reduce((sum, team) => sum + team.freeHours, 0);

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Capacidad y Planificación</span>
        <Select
          aria-label="Seleccionar período de capacidad"
          className={styles.weekSelect}
          options={weekOptions}
          value={toIsoDate(selectedMonday)}
          onChange={(event) => onWeekStartChange(event.target.value)}
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
                      <Link to={`/equipos/${team.teamId}`} className={styles.teamNameLink}>
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
                      {team.assignedHours}/{team.capacityHours} hrs ·{' '}
                      <span className={[styles.freeHours, team.freeHours > 0 ? styles.freeHoursAvailable : styles.freeHoursLimited].join(' ')}>
                        {team.freeHours} hrs libres
                      </span>
                    </span>
                    {can('teams:read') && (
                      <Link to={`/equipos/${team.teamId}`} aria-label={`Ir a ${team.teamName}`} className={styles.teamLinkIcon}>
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
          Disponibilidad global de los equipos durante el período: <strong>{totalFreeHours} horas libres</strong>
        </span>
      </div>

      <Link to="/forecast" className={styles.forecastLink}>
        <Button variant="tertiary">Ver forecast detallado</Button>
      </Link>
    </Card>
  );
}
