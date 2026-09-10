import { useMemo, useState } from 'react';
import styles from './TeamAvailabilityHeatmap.module.css';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { UserIcon } from '@/shared/components/icons/Icons';
import { useTeamAvailability } from '../api/teams.queries';
import { currentLaborWeek, type LaborWeek } from '@/modules/forecast/lib/labor-weeks';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

type ViewMode = 'daily' | 'weekly';

interface Column {
  readonly key: string;
  readonly label: string;
  readonly dates: readonly string[];
}

function addDays(iso: string, amount: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatShort(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function buildDailyColumns(week: LaborWeek): Column[] {
  return WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(week.periodStart, index);
    return { key: date, label: `${label} ${formatShort(date)}`, dates: [date] };
  });
}

function buildWeeklyColumns(startWeek: LaborWeek, count: number): Column[] {
  return Array.from({ length: count }, (_, index) => {
    const periodStart = addDays(startWeek.periodStart, index * 7);
    const periodEnd = addDays(periodStart, 4);
    const dates = Array.from({ length: 5 }, (_, dayIndex) => addDays(periodStart, dayIndex));
    return { key: periodStart, label: `${formatShort(periodStart)} - ${formatShort(periodEnd)}`, dates };
  });
}

function chipClass(hours: number) {
  if (hours <= 0) return styles.chipEmpty;
  if (hours < 8) return styles.chipLow;
  return styles.chipFull;
}

/**
 * Heatmap "Disponibilidad" — réplica de la sección homónima de `LiderEquipos`
 * (v1): horas aprobadas por colaborador y día/semana en un rango, a color
 * según carga. A diferencia del forecast (`/forecast`), que es capacidad
 * planificada a futuro, esto muestra trabajo ya realizado y aprobado.
 *
 * En la v1 vive en la misma pantalla que la cola de aprobación de HH del
 * equipo (`ficha-equipo`, destino del botón "Ver Registro de HH de Equipo");
 * en v2 cuelga de `/horas/aprobaciones` por el mismo motivo.
 */
export function TeamAvailabilityHeatmap({ teamId, teamMemberId }: { teamId: string; teamMemberId?: string | null }) {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [selectedWeek, setSelectedWeek] = useState(() => currentLaborWeek());

  const columns = useMemo(
    () => (viewMode === 'daily' ? buildDailyColumns(selectedWeek) : buildWeeklyColumns(selectedWeek, 4)),
    [viewMode, selectedWeek],
  );

  const dateFrom = columns[0]?.dates[0] ?? selectedWeek.periodStart;
  const dateTo = columns[columns.length - 1]?.dates.at(-1) ?? selectedWeek.periodEnd;

  const { data, isLoading } = useTeamAvailability(teamId, { dateFrom, dateTo });

  const hoursByMemberAndDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const member of data?.members ?? []) {
      map.set(member.teamMemberId, new Map(member.days.map((day) => [day.date, day.hours])));
    }
    return map;
  }, [data]);

  const members = (data?.members ?? []).filter((member) => !teamMemberId || member.teamMemberId === teamMemberId);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <div className={styles.toggle} role="group" aria-label="Vista de disponibilidad">
          {(['daily', 'weekly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              className={[styles.toggleButton, viewMode === mode ? styles.toggleButtonActive : ''].join(' ')}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'daily' ? 'Diario' : 'Semanal'}
            </button>
          ))}
        </div>
        <WeekRangePicker
          className={styles.periodField}
          periodStart={selectedWeek.periodStart}
          periodEnd={selectedWeek.periodEnd}
          onChange={(next) => setSelectedWeek({ ...next, label: '' })}
        />
      </div>

      {!isLoading && members.length === 0 && <p className={styles.empty}>Sin colaboradores para mostrar disponibilidad.</p>}

      {(isLoading || members.length > 0) && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.memberHeaderCell} scope="col" />
                {columns.map((column) => (
                  <th key={column.key} className={styles.headerCell} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 3 }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    <td className={styles.memberCell}>
                      <div className={styles.skeletonBar} />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className={styles.cell} />
                    ))}
                  </tr>
                ))}

              {!isLoading &&
                members.map((member) => {
                  const byDate = hoursByMemberAndDate.get(member.teamMemberId);
                  return (
                    <tr key={member.teamMemberId}>
                      <td className={styles.memberCell}>
                        <UserIcon size={14} />
                        <span>{member.fullName}</span>
                      </td>
                      {columns.map((column) => {
                        const hours = column.dates.reduce((sum, date) => sum + (byDate?.get(date) ?? 0), 0);
                        return (
                          <td key={column.key} className={styles.cell}>
                            <span
                              className={[styles.chip, chipClass(hours)].join(' ')}
                              role="status"
                              aria-label={`${member.fullName} ${column.label}: ${hours} horas`}
                            >
                              {hours.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
