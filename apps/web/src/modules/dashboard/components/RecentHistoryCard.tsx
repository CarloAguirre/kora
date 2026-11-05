import { useMemo, useState, type ReactNode } from 'react';
import type { DashboardMyTask, HourEntrySummary } from '@kora/contracts';
import styles from './RecentHistoryCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { EyeIcon, PencilIcon } from '@/shared/components/icons/Icons';
import { PeriodRangeFilter, weekPeriod, type PeriodRange } from '@/shared/components/ui/PeriodRangeFilter';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { HourEntryStatusBadge } from '@/modules/hours/components/HourEntryStatusBadge';
import { HourEntryFormDialog } from '@/modules/hours/components/HourEntryFormDialog';
import { useHourEntryDetail, useHourEntriesList } from '@/modules/hours/api/hours.queries';
import { canEditAnyMonth, isInCurrentMonth } from '@/modules/hours/lib/edit-window';
import { useToast } from '@/shared/components/ui/Toast';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { resolvedApprover } from '@/modules/hours/lib/approver';

function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? day + '/' + month + '/' + year : date;
}
function formatDateLong(date: string): string {
  const parsed = new Date(date.slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(parsed.valueOf())) return formatDate(date);
  return parsed.toLocaleDateString('es-CL', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).replaceAll('/', '-');
}
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const dateIso = (date: Date) => [date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

interface RecentHistoryCardProps {
  weekStart: string | undefined;
  onWeekStartChange: (week: string) => void;
  /** Tareas autorizadas de /dashboard/summary: para mostrar el vínculo por nombre. */
  tasks?: readonly DashboardMyTask[];
  /** En el panel del colaborador, mostrar recientes incluso si no registró horas esta semana. */
  recentDays?: number;
}

function taskName(entry: HourEntrySummary, tasks: readonly DashboardMyTask[]): string {
  if (!entry.taskId) return 'Otro trabajo del bloque';
  return tasks.find((item) => item.id === entry.taskId)?.title ?? 'Tarea vinculada (nombre no disponible)';
}

function LinkedTo({ entry, tasks }: { entry: HourEntrySummary; tasks: readonly DashboardMyTask[] }) {
  return <div className={styles.linkPills}>
    {entry.module && <span title="Fase del proyecto">{entry.module.name}</span>}
    {entry.segment && <span title="Bloque de trabajo">{entry.segment.name}</span>}
    {entry.taskId ? <span title="Tarea">{taskName(entry, tasks)}</span>
      : entry.module && <span>Otro trabajo</span>}
  </div>;
}
function approverNames(entry: HourEntrySummary) {
  const approvers = entry.project
    ? entry.projectApprovers.map((person) => person.fullName)
    : (resolvedApprover(entry) ? [resolvedApprover(entry)!.fullName] : []);
  return approvers.length ? approvers.join(', ') : 'Sin aprobador identificado';
}

function DetailItem({ label, children }: {
  label: string; children: ReactNode;
}) {
  return <div className={styles.detailRow}>
    <dt>{label}</dt><dd>{children}</dd>
  </div>;
}

/**
 * Historial autorizado del colaborador. Consulta el detalle real al abrir el ojito
 * para no atribuir a un líder la decisión que tomó otra persona. El lápiz
 * reutiliza el formulario de edición y respeta el cierre mensual del backend.
 */
export function RecentHistoryCard({ weekStart, onWeekStartChange, tasks = [], recentDays }: RecentHistoryCardProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState<PeriodRange | null>(() => {
    if (!recentDays || recentDays <= 0) return null;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (recentDays - 1));
    return { mode: 'range', dateFrom: dateIso(start), dateTo: dateIso(end) };
  });
  const period = useMemo(() => range ?? weekPeriod(weekStart), [range, weekStart]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<HourEntrySummary | null>(null);
  const [editing, setEditing] = useState<HourEntrySummary | null>(null);

  // Las decisiones no están en el listado: se leen del detalle exclusivamente
  // al solicitarlo, con la misma autorización del backend para horas propias.
  const { data: detail, isLoading: loadingDetail, isError: detailError } =
    useHourEntryDetail(selected?.id ?? null);

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

  const closeDetail = () => setSelected(null);
  const closeEdit = () => setEditing(null);
  const canEdit = (entry: HourEntrySummary) =>
    entry.user.id === user?.id &&
    entry.status !== 'approved' &&
    (canEditAnyMonth(user?.role) || isInCurrentMonth(entry.date));

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
    {
      key: 'actions',
      header: 'Acciones',
      render: (entry) => <div className={styles.actions}>
        <Button size="icon" variant="ghost" title="Ver detalle de este registro"
          aria-label={'Ver registro del ' + formatDate(entry.date)}
          onClick={() => setSelected(entry)}><EyeIcon size={16} /></Button>
        {canEdit(entry) && <Button size="icon" variant="ghost"
          title="Editar registro de horas"
          aria-label={'Editar registro del ' + formatDate(entry.date)}
          onClick={() => setEditing(entry)}><PencilIcon size={16} /></Button>}
      </div>,
    },
  ];

  const selectedEntry = detail?.id === selected?.id ? detail : selected;

  return <Card className={styles.card}>
    <div className={styles.header}>
      <h2 className={styles.title}>Historial Reciente</h2>
      <PeriodRangeFilter showLabels={false} value={period}
        onChange={(next) => {
          setPage(1);
          setSelected(null);
          setEditing(null);
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

    <Modal open={selected !== null} title="Detalle del registro"
      onClose={closeDetail}
      footer={<Button onClick={closeDetail}>Cerrar</Button>}>
      {selectedEntry && <dl className={styles.details}>
        <DetailItem label="Fecha">{formatDateLong(selectedEntry.date)}</DetailItem>
        <DetailItem label="Asignación">{selectedEntry.assignment ?? '—'}</DetailItem>
        {selectedEntry.project && <DetailItem label="Proyecto">{selectedEntry.project.name}</DetailItem>}
        {selectedEntry.module && <DetailItem label="Fase">{selectedEntry.module.name}</DetailItem>}
        {selectedEntry.segment && <DetailItem label="Bloque de trabajo">{selectedEntry.segment.name}</DetailItem>}
        {selectedEntry.module && <DetailItem label="Tarea">{taskName(selectedEntry, tasks)}</DetailItem>}
        <DetailItem label="Actividad">{selectedEntry.category}</DetailItem>
        <DetailItem label="Horas trabajadas">{formatHours(selectedEntry.hours)} h</DetailItem>
        {selectedEntry.isOvertime && <DetailItem label="Horas extra">Sí</DetailItem>}
        <DetailItem label="Descripción">{selectedEntry.description || 'Sin descripción'}</DetailItem>
        <DetailItem label="Bloqueo o problema">
          {selectedEntry.hasBlocker
            ? selectedEntry.blockerDescription || 'Sí, sin descripción' : 'No'}
        </DetailItem>
        <DetailItem label="Estado">
          <span className={styles.statusDetail}>
            <HourEntryStatusBadge status={selectedEntry.status} />
            {selectedEntry.status === 'pending'
              ? <span>En revisión por {approverNames(selectedEntry)}</span>
              : detail?.decisionBy
                ? <span>por {detail.decisionBy.fullName}</span> : null}
          </span>
        </DetailItem>
        {selectedEntry.status === 'rejected' && selectedEntry.rejectionReason &&
          <DetailItem label="Motivo de rechazo">{selectedEntry.rejectionReason}</DetailItem>}
        {detail?.decisionAt && selectedEntry.status !== 'pending' &&
          <DetailItem label="Fecha de decisión">{new Date(detail.decisionAt).toLocaleString('es-CL')}</DetailItem>}
      </dl>}
      {selected && loadingDetail && <p className={styles.note}>Consultando estado y responsable de la decisión…</p>}
      {selected && detailError && <p className={styles.note} role="alert">
        No se pudo consultar el detalle actualizado. Se muestran los datos disponibles en el historial.
      </p>}
    </Modal>
    {editing && <HourEntryFormDialog key={editing.id} open entry={editing} onClose={closeEdit}
      onSuccess={(message) => {
        toast.success(message);
        closeEdit();
      }} />}
  </Card>;
}
