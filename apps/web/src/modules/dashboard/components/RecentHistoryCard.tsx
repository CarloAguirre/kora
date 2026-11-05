import { useMemo, useState } from 'react';
import type { DashboardMyTask, HourEntrySummary } from '@kora/contracts';
import styles from './RecentHistoryCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { EyeIcon } from '@/shared/components/icons/Icons';
import { PeriodRangeFilter, weekPeriod, type PeriodRange } from '@/shared/components/ui/PeriodRangeFilter';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { HourEntryStatusBadge } from '@/modules/hours/components/HourEntryStatusBadge';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { resolvedApprover } from '@/modules/hours/lib/approver';

function formatDate(date: string): string {
  const d = new Date(date.slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.valueOf()) ? date : d.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

interface RecentHistoryCardProps {
  weekStart: string | undefined;
  onWeekStartChange: (week: string) => void;
  /** Tareas autorizadas de /dashboard/summary: para mostrar el vínculo por nombre. */
  tasks?: readonly DashboardMyTask[];
}

function LinkedTo({ entry, tasks }: {
  entry: HourEntrySummary;
  tasks: readonly DashboardMyTask[];
}) {
  const task = entry.taskId ? tasks.find((item) => item.id === entry.taskId) : undefined;
  return <div className={styles.linkPills}>
    {entry.module && <span>{entry.module.name}</span>}
    {entry.segment && <span>{entry.segment.name}</span>}
    {task && <span>{task.title}</span>}
    {entry.taskId && !task && <span>Tarea vinculada</span>}
    {!entry.taskId && <span>Otro trabajo{entry.segment ? ' del bloque' : ''}</span>}
  </div>;
}
function approverNames(entry: HourEntrySummary) {
  const approvers = entry.project
    ? entry.projectApprovers.map((person) => person.fullName)
    : (resolvedApprover(entry) ? [resolvedApprover(entry)!.fullName] : []);
  return approvers.length ? approvers.join(', ') : 'Sin aprobador identificado';
}

/**
 * Historial de la propia persona, con rango semanal o personalizado.
 * El detalle es de solo lectura. La edición sigue en /horas y sus reglas.
 */
export function RecentHistoryCard({ weekStart, onWeekStartChange, tasks = [] }: RecentHistoryCardProps) {
  const { user } = useAuth();
  const [range, setRange] = useState<PeriodRange | null>(null);
  const period = useMemo(() => range ?? weekPeriod(weekStart), [range, weekStart]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<HourEntrySummary | null>(null);

  const { data, isLoading, error } = useHourEntriesList(
    user ? {
      userId: user.id,
      dateFrom: period.dateFrom || undefined,
      dateTo: period.dateTo || undefined,
      page, pageSize,
      sortField: 'date', sortDirection: 'desc',
    } : {},
    { enabled: Boolean(user?.id) },
  );

  const columns: Column<HourEntrySummary>[] = [
    { key: 'date', header: 'Fecha', render: (entry) => formatDate(entry.date) },
    { key: 'project', header: 'Proyecto', render: (entry) =>
      entry.project?.name ?? <span className={styles.empty}>—</span> },
    { key: 'linked', header: 'Vinculado a', render: (entry) => <LinkedTo entry={entry} tasks={tasks} /> },
    { key: 'approver', header: 'Aprobador', render: (entry) => approverNames(entry) },
    { key: 'assignment', header: 'Asignación', render: (entry) => entry.assignment ?? '—' },
    { key: 'category', header: 'Actividad', render: (entry) =>
      entry.category || <span className={styles.empty}>—</span> },
    { key: 'hours', header: 'Horas', align: 'right', render: (entry) => formatHours(entry.hours) },
    { key: 'status', header: 'Estado', render: (entry) =>
      <HourEntryStatusBadge status={entry.status} /> },
    { key: 'actions', header: 'Acciones', render: (entry) =>
      <Button size="sm" variant="ghost" title="Ver detalle de este registro"
        aria-label={'Ver registro del ' + formatDate(entry.date)}
        onClick={() => setSelected(entry)}><EyeIcon size={15} /></Button> },
  ];

  return <Card className={styles.card}>
    <div className={styles.header}>
      <h2 className={styles.title}>Historial Reciente</h2>
      <PeriodRangeFilter showLabels={false} value={period}
        onChange={(next) => {
          setPage(1);
          setSelected(null);
          if (next.mode === 'week') {
            setRange(null);
            onWeekStartChange(next.dateFrom);
          } else {
            setRange(next);
          }
        }} />
    </div>
    <DataTable caption="Historial reciente de mis horas" columns={columns}
      items={data?.items ?? []} getRowKey={(entry) => entry.id}
      loading={isLoading} error={error ? 'No se pudo cargar el historial de horas.' : null}
      emptyMessage={period.mode === 'week'
        ? 'No hay registros en esta semana.' : 'No hay registros en este período.'}
      />
    {data && <Pagination page={page} pageCount={data.pageCount}
      total={data.total} pageSize={data.pageSize} onPageChange={setPage}
      onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}

    <Modal open={selected !== null} title="Detalle de registro de horas"
      onClose={() => setSelected(null)}>
      {selected && <dl className={styles.details}>
        <div><dt>Fecha</dt><dd>{formatDate(selected.date)}</dd></div>
        <div><dt>Proyecto</dt><dd>{selected.project?.name ?? 'Sin proyecto'}</dd></div>
        <div><dt>Vinculado a</dt><dd><LinkedTo entry={selected} tasks={tasks} /></dd></div>
        <div><dt>Aprobador</dt><dd>{approverNames(selected)}</dd></div>
        <div><dt>Asignación</dt><dd>{selected.assignment ?? '—'}</dd></div>
        <div><dt>Actividad</dt><dd>{selected.category}</dd></div>
        <div><dt>Descripción</dt><dd>{selected.description || 'Sin descripción'}</dd></div>
        <div><dt>Horas</dt><dd>{formatHours(selected.hours)} HH</dd></div>
        <div><dt>Estado</dt><dd><HourEntryStatusBadge status={selected.status} /></dd></div>
      </dl>}
    </Modal>
  </Card>;
}
