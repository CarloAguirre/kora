import { useMemo, useState } from 'react';
import styles from './TeamAvailabilityHeatmap.module.css';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { UserIcon } from '@/shared/components/icons/Icons';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { useTeamAvailability } from '../api/teams.queries';
import { currentLaborWeek, type LaborWeek } from '@/modules/forecast/lib/labor-weeks';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

type ViewMode = 'daily' | 'weekly';

interface Column {
  readonly key: string;
  readonly label: string;
  readonly dates: readonly string[];
}

/** Leyenda de colores de las celdas — mismo orden de prioridad que `chipClass`. */
const LEGEND = [
  { className: styles.chipPending, label: 'Pendientes de aprobación' },
  { className: styles.chipPendingOther, label: 'Pendientes de otro aprobador' },
  { className: styles.chipEmpty, label: 'Sin horas' },
  { className: styles.chipLow, label: 'Menos de 8 h' },
  { className: styles.chipFull, label: '8 h o más' },
];

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

const formatHours = (hours: number) => `${hours.toLocaleString('es-CL', { maximumFractionDigits: 1 })}h`;

/**
 * Con horas enviadas sin aprobar que le tocan a quien mira, la celda va en azul
 * (Figma node 10306:163467), sin importar cuánto haya aprobado. Las pendientes
 * que aprueba otra persona (p.ej. el líder de un proyecto al que el equipo no
 * está asignado) van aparte: en azul parecían trabajo propio que la cola de
 * abajo no mostraba.
 */
function chipClass(hours: number, myPendingHours: number, otherPendingHours: number) {
  if (myPendingHours > 0) return styles.chipPending;
  if (otherPendingHours > 0) return styles.chipPendingOther;
  if (hours <= 0) return styles.chipEmpty;
  if (hours < 8) return styles.chipLow;
  return styles.chipFull;
}

/**
 * Heatmap "Disponibilidad" — réplica de la sección homónima de `LiderEquipos`
 * (v1): horas por colaborador y día/semana en un rango, a color según carga.
 * Las celdas con horas enviadas que esperan aprobación van en azul y suman
 * aprobadas + pendientes (el desglose, en el tooltip). A diferencia del forecast (`/forecast`), que es capacidad
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
  // Misma consulta y alcance que la cola de aprobación de abajo: la API solo
  // devuelve las pendientes que quien mira puede aprobar, así ambas cuadran.
  const { data: myPending } = useHourEntriesList({ teamId, status: 'pending', dateFrom, dateTo, pageSize: 200 });

  const myPendingByUserAndDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of myPending?.items ?? []) {
      const key = `${entry.user.id}|${entry.date}`;
      map.set(key, (map.get(key) ?? 0) + entry.hours);
    }
    return map;
  }, [myPending]);

  const hoursByMemberAndDate = useMemo(() => {
    const map = new Map<string, Map<string, { hours: number; pendingHours: number }>>();
    for (const member of data?.members ?? []) {
      map.set(member.teamMemberId, new Map(member.days.map((day) => [day.date, day])));
    }
    return map;
  }, [data]);

  const members = (data?.members ?? []).filter((member) => !teamMemberId || member.teamMemberId === teamMemberId);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <ul className={styles.legend} aria-label="Colores">
          {LEGEND.map((item) => (
            <li key={item.label} className={styles.legendItem}>
              <span className={[styles.legendSwatch, item.className].join(' ')} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
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
          displayPeriodEnd={dateTo}
          hint={
            viewMode === 'weekly'
              ? 'Semana laboral: lunes a viernes · se muestra esta semana y las 3 siguientes'
              : 'Semana laboral: lunes a viernes'
          }
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
                        const hours = column.dates.reduce((sum, date) => sum + (byDate?.get(date)?.hours ?? 0), 0);
                        const pendingHours = column.dates.reduce((sum, date) => sum + (byDate?.get(date)?.pendingHours ?? 0), 0);
                        const myPendingHours = Math.min(
                          pendingHours,
                          column.dates.reduce((sum, date) => sum + (myPendingByUserAndDate.get(`${member.userId}|${date}`) ?? 0), 0),
                        );
                        const otherPendingHours = pendingHours - myPendingHours;
                        const detail =
                          [
                            myPendingHours > 0 && `${formatHours(myPendingHours)} pendientes de tu aprobación`,
                            otherPendingHours > 0 && `${formatHours(otherPendingHours)} pendientes de otro aprobador`,
                            (hours > 0 || pendingHours === 0) && `${formatHours(hours)} aprobadas`,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                        return (
                          <td key={column.key} className={styles.cell}>
                            <span
                              className={[styles.chip, chipClass(hours, myPendingHours, otherPendingHours)].join(' ')}
                              role="status"
                              title={detail}
                              aria-label={`${member.fullName} ${column.label}: ${detail}`}
                            >
                              {formatHours(hours + pendingHours)}
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
