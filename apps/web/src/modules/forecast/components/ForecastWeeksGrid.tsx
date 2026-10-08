import { useMemo, useState } from 'react';
import type { ForecastWeekCell } from '@kora/contracts';
import styles from './ForecastWeeksGrid.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon, DiamondIcon } from '@/shared/components/icons/Icons';
import { useForecastWeeks } from '../api/forecast.queries';
import { currentLaborWeek, formatWeekHeader, shiftLaborWeek } from '../lib/labor-weeks';

const WEEKS_SHOWN = 6;

function heatClass(cell: ForecastWeekCell): string | undefined {
  if (cell.absenceHours > 0 && cell.absenceHours >= cell.assignedHours) return styles.absence;
  if (cell.loadPercent > 100) return styles.over;
  if (cell.loadPercent >= 90) return styles.full;
  if (cell.loadPercent >= 50) return styles.mid;
  if (cell.loadPercent > 0) return styles.low;
  return styles.empty;
}

function cellTitle(fullName: string, header: string, cell: ForecastWeekCell): string {
  return [
    `${fullName} · ${header}`,
    `${cell.assignedHours} de ${cell.capacityHours} h (${cell.loadPercent} %)`,
    cell.absenceHours > 0 ? `${cell.absenceHours} h de ausencia` : '',
    cell.hasStale ? 'tiene ajustes desfasados' : cell.hasAdjusted ? 'tiene ajustes del líder' : '',
    cell.deliveryCount > 0 ? `${cell.deliveryCount} ${cell.deliveryCount === 1 ? 'entrega' : 'entregas'}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ForecastWeeksGridProps {
  /** Solo los colaboradores de este equipo; sin él, todos. */
  teamId?: string;
  /** Clic en una celda (vista del líder): abre esa persona en esa semana. Sin él, la grilla es de solo lectura. */
  onSelectCell?: (teamMemberId: string, periodStart: string) => void;
}

/**
 * "Próximas semanas": carga de cada colaborador en varias semanas seguidas. Ahora que el Forecast se
 * calcula desde los proyectos tiene datos a futuro, y esta vista sirve para anticipar sobrecargas y
 * huecos — ver docs/DECISION-M6-FORECAST.md, "Forecast calculado".
 */
export function ForecastWeeksGrid({ teamId, onSelectCell }: ForecastWeeksGridProps) {
  const [from, setFrom] = useState(() => currentLaborWeek().periodStart);
  const { data, isLoading, error } = useForecastWeeks({ from, weeks: WEEKS_SHOWN });

  const members = useMemo(
    () => (data?.members ?? []).filter((member) => !teamId || member.teamId === teamId),
    [data, teamId],
  );
  const headers = useMemo(() => (data?.weeks ?? []).map((week) => formatWeekHeader(week.periodStart, week.periodEnd)), [data]);

  return (
    <Card className={styles.section}>
      <div className={styles.toolbar}>
        <h3 className={styles.title}>Próximas semanas</h3>
        <div className={styles.nav}>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<ChevronLeftIcon size={16} />}
            onClick={() => setFrom(shiftLaborWeek(from, -WEEKS_SHOWN).periodStart)}
          >
            Anteriores
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFrom(currentLaborWeek().periodStart)}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconRight={<ChevronRightIcon size={16} />}
            onClick={() => setFrom(shiftLaborWeek(from, WEEKS_SHOWN).periodStart)}
          >
            Siguientes
          </Button>
        </div>
      </div>

      <div className={styles.legend}>
        <span><i className={styles.empty} />0 %</span>
        <span><i className={styles.low} />1–49 %</span>
        <span><i className={styles.mid} />50–89 %</span>
        <span><i className={styles.full} />90–100 %</span>
        <span><i className={styles.over} />Sobre 100 %</span>
        <span><i className={styles.absence} />Ausencia</span>
        <span><i className={styles.dotAdjusted} />Con ajustes</span>
        <span><i className={styles.dotStale} />Ajuste desfasado</span>
        <span className={styles.legendDelivery}><DiamondIcon size={12} />Entrega</span>
      </div>

      {error ? (
        <p className={styles.message}>No se pudo cargar la vista de semanas.</p>
      ) : isLoading ? (
        <p className={styles.message}>Cargando…</p>
      ) : members.length === 0 ? (
        <p className={styles.message}>No hay colaboradores activos.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <caption className={styles.srOnly}>Carga por colaborador y semana</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.nameHead}>Colaborador</th>
                {(data?.weeks ?? []).map((week, index) => (
                  <th key={week.periodStart} scope="col">
                    {headers[index]}
                    {week.businessDays < 5 && (
                      <span className={styles.holiday}>
                        {5 - week.businessDays} {5 - week.businessDays === 1 ? 'feriado' : 'feriados'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.teamMemberId}>
                  <th scope="row" className={styles.name}>
                    {member.fullName}
                    {!teamId && <span className={styles.team}>{member.teamName}</span>}
                  </th>
                  {member.cells.map((cell, index) => {
                    const content = (
                      <>
                        {cell.absenceHours > 0 && cell.absenceHours >= cell.assignedHours ? 'Aus.' : `${cell.loadPercent}%`}
                        {(cell.hasStale || cell.hasAdjusted) && (
                          <span className={cell.hasStale ? styles.dotStale : styles.dotAdjusted} aria-hidden="true" />
                        )}
                        {cell.deliveryCount > 0 && (
                          <span className={styles.delivery} aria-hidden="true">
                            <DiamondIcon size={10} />
                          </span>
                        )}
                      </>
                    );
                    const title = cellTitle(member.fullName, headers[index] ?? '', cell);
                    return (
                      <td key={cell.periodStart}>
                        {onSelectCell ? (
                          <button
                            type="button"
                            className={[styles.cell, heatClass(cell)].join(' ')}
                            title={title}
                            aria-label={title.replaceAll('\n', ', ')}
                            onClick={() => onSelectCell(member.teamMemberId, cell.periodStart)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className={[styles.cell, heatClass(cell)].join(' ')} title={title}>
                            {content}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
