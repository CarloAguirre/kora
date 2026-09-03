import { useMemo } from 'react';
import type { HourEntrySummary } from '@kora/contracts';
import styles from './RecentHistoryCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { HourEntryStatusBadge } from '@/modules/hours/components/HourEntryStatusBadge';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';

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

function formatShort(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

interface RecentHistoryCardProps {
  weekStart: string | undefined;
  onWeekStartChange: (weekStart: string) => void;
}

/**
 * "Historial Reciente" del propio `collaborator` en el Dashboard — réplica del
 * card homónimo de `ColaboradorDashboard` (v1): sus propios registros de la
 * semana seleccionada, de solo lectura (editar/eliminar vive en `/horas`, ver
 * `DECISION-M7-DASHBOARD.md`).
 */
export function RecentHistoryCard({ weekStart, onWeekStartChange }: RecentHistoryCardProps) {
  const { user } = useAuth();
  const currentMonday = useMemo(() => mondayOf(new Date()), []);
  const selectedMonday = useMemo(
    () => mondayOf(weekStart ? new Date(`${weekStart}T00:00:00`) : new Date()),
    [weekStart],
  );
  const selectedSunday = useMemo(() => addDays(selectedMonday, 6), [selectedMonday]);

  const weekOptions = useMemo(
    () =>
      Array.from({ length: 13 }, (_, index) => {
        const offset = index - 6;
        const monday = mondayOf(addDays(currentMonday, offset * 7));
        const sunday = addDays(monday, 6);
        const isCurrent = toIsoDate(monday) === toIsoDate(currentMonday);
        return {
          value: toIsoDate(monday),
          label: isCurrent ? `Semana actual (${formatShort(monday)} - ${formatShort(sunday)})` : `${formatShort(monday)} - ${formatShort(sunday)}`,
        };
      }),
    [currentMonday],
  );

  const { data, isLoading, error } = useHourEntriesList(
    user
      ? {
          userId: user.id,
          dateFrom: toIsoDate(selectedMonday),
          dateTo: toIsoDate(selectedSunday),
          pageSize: 50,
          sortField: 'date',
          sortDirection: 'desc',
        }
      : {},
  );

  const columns: Column<HourEntrySummary>[] = [
    { key: 'date', header: 'Fecha', render: (e) => formatDate(e.date) },
    { key: 'project', header: 'Proyecto', render: (e) => e.project?.name ?? <span className={styles.empty}>—</span> },
    {
      key: 'approver',
      header: 'Aprobador',
      render: (e) => {
        const names = e.designatedApprover ? [e.designatedApprover.fullName] : e.projectApprovers.map((a) => a.fullName);
        return names.length > 0 ? names.join(', ') : <span className={styles.empty}>—</span>;
      },
    },
    { key: 'assignment', header: 'Asignación', render: (e) => e.assignment ?? 'Desarrollo' },
    { key: 'category', header: 'Actividad', render: (e) => e.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'Horas', align: 'right', render: (e) => formatHours(e.hours) },
    { key: 'status', header: 'Estado', render: (e) => <HourEntryStatusBadge status={e.status} /> },
  ];

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Historial Reciente</h3>
        <Select
          aria-label="Seleccionar semana"
          className={styles.weekSelect}
          options={weekOptions}
          value={toIsoDate(selectedMonday)}
          onChange={(event) => onWeekStartChange(event.target.value)}
        />
      </div>

      <DataTable
        caption="Historial reciente de mis horas"
        columns={columns}
        items={data?.items ?? []}
        getRowKey={(entry) => entry.id}
        loading={isLoading}
        error={error ? 'No se pudo cargar el historial de horas.' : null}
        emptyMessage="No hay registros en esta semana."
      />
    </Card>
  );
}
