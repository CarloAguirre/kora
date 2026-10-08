import type { ForecastOverloadWarning } from '@kora/contracts';
import styles from './ForecastOverloadAlert.module.css';
import { TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { formatWeekHeader } from '../lib/labor-weeks';
import { formatHours } from '../lib/hours-format';

const WEEKS_PER_PERSON = 3;

function describeWeek(warning: ForecastOverloadWarning, sourceLabel: string): string {
  const total = `${formatHours(warning.totalHours)} de ${formatHours(warning.capacityHours)} h`;
  if (warning.currentHours >= warning.capacityHours) {
    return `ya estaba al ${Math.round((warning.currentHours / warning.capacityHours) * 100)} %; con ${sourceLabel} queda en ${warning.loadPercent} % (${total})`;
  }
  return `quedaría en ${warning.loadPercent} % (${total}, +${formatHours(warning.addedHours)} h de ${sourceLabel})`;
}

export interface ForecastOverloadAlertProps {
  warnings: readonly ForecastOverloadWarning[] | undefined;
  /** Cómo nombrar lo que se está guardando: "este tramo", "esta tarea". */
  sourceLabel: string;
}

/**
 * Aviso de sobrecarga al cargar horas a una persona (tramo del Roadmap, tarea): las semanas en que ya
 * estaba al 100 % o lo pasaría. No bloquea el guardado — el líder decide, y puede ajustar el Forecast.
 */
export function ForecastOverloadAlert({ warnings, sourceLabel }: ForecastOverloadAlertProps) {
  if (!warnings || warnings.length === 0) return null;

  const byPerson = new Map<string, ForecastOverloadWarning[]>();
  for (const warning of warnings) {
    const list = byPerson.get(warning.teamMemberId);
    if (list) list.push(warning);
    else byPerson.set(warning.teamMemberId, [warning]);
  }

  return (
    <div className={styles.alert} role="alert">
      <div className={styles.head}>
        <TriangleAlertIcon size={16} />
        <strong>{byPerson.size === 1 ? 'Esta persona queda sobre su capacidad' : 'Hay personas que quedan sobre su capacidad'}</strong>
      </div>
      <ul className={styles.list}>
        {[...byPerson.values()].map((personWarnings) => (
          <li key={personWarnings[0]!.teamMemberId}>
            <span className={styles.name}>{personWarnings[0]!.fullName}</span>
            <ul className={styles.weeks}>
              {personWarnings.slice(0, WEEKS_PER_PERSON).map((warning) => (
                <li key={warning.periodStart}>
                  <span className={styles.week}>{formatWeekHeader(warning.periodStart, warning.periodEnd)}</span>:{' '}
                  {describeWeek(warning, sourceLabel)}
                </li>
              ))}
              {personWarnings.length > WEEKS_PER_PERSON && (
                <li className={styles.more}>
                  y {personWarnings.length - WEEKS_PER_PERSON}{' '}
                  {personWarnings.length - WEEKS_PER_PERSON === 1 ? 'semana más' : 'semanas más'}
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      <p className={styles.note}>Al guardar te pediremos confirmar. Las horas se pueden ajustar después en el Forecast.</p>
    </div>
  );
}

/** Una línea para el diálogo "¿Guardar igual?", p. ej. "Hirma Yanez queda en 150 % (5–9 oct) y 1 semana más". */
export function summarizeOverload(warnings: readonly ForecastOverloadWarning[]): string {
  const byPerson = new Map<string, ForecastOverloadWarning[]>();
  for (const warning of warnings) {
    const list = byPerson.get(warning.teamMemberId);
    if (list) list.push(warning);
    else byPerson.set(warning.teamMemberId, [warning]);
  }
  const people = [...byPerson.values()].map((personWarnings) => {
    const worst = personWarnings.reduce((max, warning) => (warning.loadPercent > max.loadPercent ? warning : max));
    const others = personWarnings.length - 1;
    const extra = others > 0 ? ` y ${others} ${others === 1 ? 'semana más' : 'semanas más'}` : '';
    return `${worst.fullName} queda en ${worst.loadPercent} % (${formatWeekHeader(worst.periodStart, worst.periodEnd)})${extra}`;
  });
  return `${people.join('; ')}. Puedes guardar igual y ajustar las horas después en el Forecast.`;
}
