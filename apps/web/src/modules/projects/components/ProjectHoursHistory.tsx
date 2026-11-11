import { useMemo } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import styles from './ProjectHoursHistory.module.css';

type HistoryProject = Pick<ProjectDetail,
  'approvedMonthlyHours' | 'hito0At' | 'startDate' | 'status'>;

type MonthHours = NonNullable<ProjectDetail['approvedMonthlyHours']>[number];

const formatHours = (hours: number) =>
  hours.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Convierte YYYY-MM en un ordinal para mantener los meses sin registros como espacios vacíos. */
const monthOrdinal = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthFromOrdinal = (ordinal: number) =>
  `${Math.floor(ordinal / 12)}-${String(ordinal % 12 + 1).padStart(2, '0')}`;
const monthLabel = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))
    .toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Solo representación; nunca crea fases, mueve HH ni influye en el avance del plan. */
export function buildHistoricalMonths(rows: readonly MonthHours[]): MonthHours[] {
  if (rows.length === 0) return [];
  const data = new Map(rows.map((row) => [row.month, row]));
  const ordinals = rows.map((row) => monthOrdinal(row.month));
  const min = Math.min(...ordinals);
  const max = Math.max(...ordinals);
  const result: MonthHours[] = [];
  for (let current = min; current <= max; current++) {
    const month = monthFromOrdinal(current);
    result.push(data.get(month) ?? { month, preactivationHours: 0, executionHours: 0 });
  }
  return result;
}

export function ProjectHoursHistory({ project }: { readonly project: HistoryProject }) {
  const months = useMemo(
    () => buildHistoricalMonths(project.approvedMonthlyHours ?? []),
    [project.approvedMonthlyHours],
  );
  if (months.length === 0) return null;

  const maxHours = Math.max(
    1, ...months.map((item) => item.preactivationHours + item.executionHours),
  );
  const approvedTotal = months.reduce(
    (total, item) => total + item.preactivationHours + item.executionHours, 0,
  );
  const preactivationTotal = months.reduce((total, item) => total + item.preactivationHours, 0);
  const cutoffDate = project.hito0At?.slice(0, 10) ??
    (project.status === 'active' ? project.startDate : null);
  const cutoffLabel = project.hito0At ? 'Hito 0 oficial' : 'Inicio provisional';

  return (
    <section className={styles.root} aria-label="Histórico mensual de horas aprobadas">
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Histórico de horas aprobadas</h3>
          <p className={styles.subtitle}>
            Horas en el mes en que se trabajaron; independiente de las fases y bloques planificados.
          </p>
        </div>
        <strong className={styles.total}>{formatHours(approvedTotal)} HH</strong>
      </div>
      <div className={styles.scroll} tabIndex={0}
        aria-label="Distribución mensual de HH; desplázate horizontalmente si es necesario">
        <div className={styles.months} role="list">
          {months.map((item) => {
            const total = item.preactivationHours + item.executionHours;
            return (
              <div className={styles.month} role="listitem" key={item.month}
                title={`${item.month}: ${formatHours(total)} HH; antes del corte ${formatHours(item.preactivationHours)}; ejecución ${formatHours(item.executionHours)}`}>
                <span className={styles.value}>{total > 0 ? formatHours(total) : '—'}</span>
                <div className={styles.barTrack} aria-hidden="true">
                  {item.preactivationHours > 0 && (
                    <div className={styles.preactivation} style={{
                      height: `${item.preactivationHours / maxHours * 100}%`,
                    }} />
                  )}
                  {item.executionHours > 0 && (
                    <div className={styles.execution} style={{
                      height: `${item.executionHours / maxHours * 100}%`,
                    }} />
                  )}
                </div>
                <span className={styles.monthLabel}>{monthLabel(item.month)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.legend}>
          <i className={styles.preactivationKey} aria-hidden="true" />
          Antes del corte: {formatHours(preactivationTotal)} HH
        </span>
        <span className={styles.legend}>
          <i className={styles.executionKey} aria-hidden="true" />
          Ejecución: {formatHours(approvedTotal - preactivationTotal)} HH
        </span>
        {cutoffDate && (
          <span className={styles.cutoff}>
            {cutoffLabel}: {cutoffDate.split('-').reverse().join('-')}
          </span>
        )}
      </div>
      <p className={styles.note}>
        El histórico refleja HH aprobadas, no porcentaje de avance.
        Las horas no se reasignan a bloques ni se altera la planificación.
      </p>
    </section>
  );
}
