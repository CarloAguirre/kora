import { useMemo, useState } from 'react';
import type { HourEntrySummary } from '@kora/contracts';
import styles from './RecentHistoryCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { PeriodRangeFilter, weekPeriod, type PeriodRange } from '@/shared/components/ui/PeriodRangeFilter';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { HourEntryStatusBadge } from '@/modules/hours/components/HourEntryStatusBadge';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { resolvedApprover } from '@/modules/hours/lib/approver';

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
 * `DECISION-M7-DASHBOARD.md`). Además de la semana (compartida con el resto
 * del Dashboard) admite un rango de fechas libre, p. ej. para ver un mes.
 */
export function RecentHistoryCard({ weekStart, onWeekStartChange }: RecentHistoryCardProps) {
  const { user } = useAuth();
  // `null` = modo semana, que sale de `weekStart` (compartido con el Dashboard); el rango es propio del card.
  const [range, setRange] = useState<PeriodRange | null>(null);
  const period = useMemo(() => range ?? weekPeriod(weekStart), [range, weekStart]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data, isLoading, error } = useHourEntriesList(
    user
      ? {
          userId: user.id,
          dateFrom: period.dateFrom || undefined,
          dateTo: period.dateTo || undefined,
          page,
          pageSize,
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
        const names = e.project ? e.projectApprovers.map((a) => a.fullName) : (resolvedApprover(e) ? [resolvedApprover(e)!.fullName] : []);
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
        <PeriodRangeFilter
          showLabels={false}
          value={period}
          onChange={(next) => {
            setPage(1);
            if (next.mode === 'week') {
              setRange(null);
              onWeekStartChange(next.dateFrom);
            } else {
              setRange(next);
            }
          }}
        />
      </div>

      <DataTable
        caption="Historial reciente de mis horas"
        columns={columns}
        items={data?.items ?? []}
        getRowKey={(entry) => entry.id}
        loading={isLoading}
        error={error ? 'No se pudo cargar el historial de horas.' : null}
        emptyMessage={period.mode === 'week' ? 'No hay registros en esta semana.' : 'No hay registros en este período.'}
      />

      {data && (
        <Pagination
          page={page}
          pageCount={data.pageCount}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </Card>
  );
}
