import { useMemo } from 'react';
import type { HourEntrySummary, ListHourEntriesQuery } from '@kora/contracts';
import styles from './HoursApprovalsSummary.module.css';
import { Card } from '@/shared/components/ui/Card';
import { useHourEntriesList } from '../api/hours.queries';
import { resolvedApprover } from '../lib/approver';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

interface BreakdownItem {
  key: string;
  label: string;
  hours: number;
}

function buildBreakdown(entries: readonly HourEntrySummary[], keyOf: (entry: HourEntrySummary) => BreakdownItem['key'] | null, labelOf: (entry: HourEntrySummary) => string): BreakdownItem[] {
  const byKey = new Map<string, BreakdownItem>();
  for (const entry of entries) {
    const key = keyOf(entry) ?? 'sin-asignar';
    const existing = byKey.get(key);
    if (existing) existing.hours += entry.hours;
    else byKey.set(key, { key, label: labelOf(entry), hours: entry.hours });
  }
  return [...byKey.values()].sort((a, b) => b.hours - a.hours);
}

/**
 * Resumen numérico de la cola de aprobación, arriba de todo en
 * `/horas/aprobaciones`. Reutiliza el mismo `query` que `HourEntriesApprovalTable`
 * — misma queryKey en React Query, así que no duplica el fetch.
 */
export function HoursApprovalsSummary({ query }: { query: Partial<ListHourEntriesQuery> }) {
  const { data, isLoading } = useHourEntriesList({ status: 'pending', page: 1, pageSize: 100, sortField: 'date', ...query });
  const entries = data?.items ?? [];

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const collaboratorCount = new Set(entries.map((entry) => entry.user.id)).size;

  const byLeader = useMemo(
    () =>
      buildBreakdown(
        entries,
        (entry) => resolvedApprover(entry)?.id ?? 'sin-aprobador',
        (entry) => resolvedApprover(entry)?.fullName ?? 'Sin aprobador asignado',
      ),
    [entries],
  );
  if (!isLoading && entries.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.statRow}>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Horas pendientes</span>
          <span className={styles.statValue}>{isLoading ? '…' : formatHours(totalHours)}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Registros pendientes</span>
          <span className={styles.statValue}>{isLoading ? '…' : entries.length}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Colaboradores</span>
          <span className={styles.statValue}>{isLoading ? '…' : collaboratorCount}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Líderes responsables</span>
          <span className={styles.statValue}>{isLoading ? '…' : byLeader.length}</span>
        </Card>
      </div>
    </div>
  );
}
