import { FORECAST_ASSIGNMENT_TYPE_LABELS } from '@kora/contracts';
import styles from './ForecastHistoryPanel.module.css';
import { useForecastHistory } from '../api/forecast.queries';

const ACTION_LABELS: Record<string, string> = { created: 'creó', updated: 'editó', deleted: 'eliminó' };
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');

/** Réplica de `ForecastHistoryPanel` en la v1 — historial del equipo y período seleccionados. */
export function ForecastHistoryPanel({ teamId, periodStart, periodEnd }: { teamId: string; periodStart: string; periodEnd: string }) {
  const { data, isLoading } = useForecastHistory({ teamId, periodStart, periodEnd });

  if (isLoading) return <p className={styles.empty}>Cargando historial…</p>;
  if (!data || data.length === 0) return <p className={styles.empty}>Sin cambios registrados en este período.</p>;

  return (
    <div className={styles.entries}>
      {data.map((entry) => (
        <div key={entry.id} className={styles.entry}>
          <p className={styles.description}>
            {entry.actorName ?? 'Alguien'} {ACTION_LABELS[entry.action] ?? entry.action} una asignación de{' '}
            <strong>{entry.memberFullName ?? 'un colaborador'}</strong>
            {entry.type && ` — ${FORECAST_ASSIGNMENT_TYPE_LABELS[entry.type]}`}
            {entry.projectName && ` (${entry.projectName})`}
            {entry.assignedHours != null && ` · ${entry.assignedHours}h`}
          </p>
          <p className={styles.meta}>{formatDateTime(entry.occurredAt)}</p>
        </div>
      ))}
    </div>
  );
}
