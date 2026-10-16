import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TeamReportProject, TeamReportResponse } from '@kora/contracts';
import styles from './TeamReport.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { SearchIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import type { SortState } from '@/shared/components/ui/DataTable';
import { compareSortValues, nextSortState, type SortValue } from '@/shared/lib/sort';
import { projectTeamPath } from '@/app/router/paths';
import { useTeamReport, useUpdateTeamReportComment } from '../api/teams.queries';
import { RequestReportDataDialog } from './RequestReportDataDialog';
import {
  PARTICIPATION_STATUSES,
  PARTICIPATION_STATUS_LABELS,
  PERIOD_PRESETS,
  PERIOD_PRESET_LABELS,
  buildReportRows,
  formatDayMonth,
  formatDmy,
  formatReportHours,
  pendingHoursInPeriod,
  periodRange,
  personInitials,
  sumReportRows,
  todayIso,
  type ParticipationStatus,
  type PeriodPreset,
  type TeamReportRow,
} from '../lib/team-report';

type SortField = 'project' | 'startDate' | 'endDate' | 'assigned' | 'status' | 'total' | 'balance';
type AlertFilter = '' | 'missing_assigned' | 'missing_dates';

const ALERT_FILTER_LABELS: Record<Exclude<AlertFilter, ''>, string> = {
  missing_assigned: 'Sin HH asignadas',
  missing_dates: 'Sin fechas',
};

const PAGE_SIZE_OPTIONS = [10, 15, 20];

/** Valor por el que se ordena cada columna — el mismo que se muestra (el estado, por su etiqueta). */
const SORT_VALUE: Record<SortField, (row: TeamReportRow) => SortValue> = {
  project: (row) => row.project.name,
  // Fechas ISO 'YYYY-MM-DD': el orden de texto coincide con el cronológico; sin fecha va al final.
  startDate: (row) => row.project.startDate,
  endDate: (row) => row.project.endDate,
  assigned: (row) => row.assigned,
  status: (row) => PARTICIPATION_STATUS_LABELS[row.participation.status],
  total: (row) => row.total,
  balance: (row) => row.balance,
};

const STATUS_CLASS: Record<ParticipationStatus, string> = {
  in_progress: styles.statusInProgress!,
  on_hold: styles.statusOnHold!,
  finished: styles.statusFinished!,
  client_ok: styles.statusClientOk!,
  not_started: styles.statusNotStarted!,
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export interface TeamReportProps {
  readonly team: { id: string; slug?: string | null };
  readonly currentUserId: string | undefined;
  /** Filtro "Colaborador" — compartido con la barra de contexto del equipo. `''` = todos. */
  readonly memberUserId: string;
  readonly onMemberChange: (userId: string) => void;
}

/**
 * "Reporte de equipo" del líder — reemplaza la tabla "Proyectos del equipo". Comportamiento
 * portado del prototipo `Kora — Reporte de equipo (Líder de equipo).html`; lo visual, del
 * Figma (fileKey Sqc5DJtmbLtnBhAM0y4Fww, node 10306:163496).
 */
export function TeamReport({ team, currentUserId, memberUserId, onMemberChange }: TeamReportProps) {
  const today = useMemo(() => todayIso(), []);
  const [preset, setPreset] = useState<PeriodPreset>('accumulated');
  const [range, setRange] = useState(() => periodRange('accumulated', today));
  const [includePending, setIncludePending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ParticipationStatus | 'all'>('all');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('');
  const [search, setSearch] = useState('');
  // `null` = el orden del servidor (cliente, proyecto) — el del período "Acumulado".
  const [sort, setSort] = useState<SortState<SortField> | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]!);
  const tableRef = useRef<HTMLDivElement>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: report, isLoading, error } = useTeamReport(team.id, range);
  const rows = useMemo(() => (report ? buildReportRows(report, includePending) : []), [report, includePending]);
  const members = report?.members ?? [];

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter !== 'all' && row.participation.status !== statusFilter) return false;
      if (alertFilter === 'missing_assigned' && !row.missingAssigned) return false;
      if (alertFilter === 'missing_dates' && !row.missingDates) return false;
      if (memberUserId && !((row.hoursByUser.get(memberUserId) ?? 0) > 0)) return false;
      if (query) {
        const haystack = [row.project.client?.companyName, row.project.name, row.project.comment].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    if (!sort) return filtered;
    const valueOf = SORT_VALUE[sort.field];
    return [...filtered].sort((a, b) => compareSortValues(valueOf(a), valueOf(b), sort.direction));
  }, [rows, statusFilter, alertFilter, memberUserId, search, sort]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const hasFilters = statusFilter !== 'all' || alertFilter !== '' || memberUserId !== '' || search.trim() !== '';

  const resetPage = () => setPage(1);

  /** Con un período acotado, lo útil es ver primero dónde se fueron las HH; en "Acumulado", el orden natural. */
  const applyRange = (nextPreset: PeriodPreset, nextRange: { dateFrom: string; dateTo: string }) => {
    setPreset(nextPreset);
    setRange(nextRange);
    setSort(nextPreset === 'accumulated' ? null : { field: 'total', direction: 'desc' });
    resetPage();
  };

  const changePreset = (value: string) => {
    const next = value as PeriodPreset;
    if (next === 'custom') {
      setPreset('custom');
      return;
    }
    applyRange(next, periodRange(next, today));
  };

  const changeDate = (field: 'dateFrom' | 'dateTo', value: string) => {
    if (!value) return;
    const next = { ...range, [field]: value };
    if (next.dateFrom > next.dateTo) {
      if (field === 'dateFrom') next.dateTo = next.dateFrom;
      else next.dateFrom = next.dateTo;
    }
    applyRange('custom', next);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setAlertFilter('');
    setSearch('');
    onMemberChange('');
    resetPage();
  };

  const showAlertRows = (filter: AlertFilter) => {
    setAlertFilter(filter);
    resetPage();
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const toggleSort = (field: SortField) => {
    setSort((prev) => nextSortState(prev, field));
    resetPage();
  };

  return (
    <>
      <div className={styles.periodRow}>
        <div className={styles.period}>
          <Select
            className={styles.periodPreset}
            label="Período"
            options={PERIOD_PRESETS.map((value) => ({
              value,
              label: PERIOD_PRESET_LABELS[value],
            }))}
            value={preset}
            onChange={(event) => changePreset(event.target.value)}
          />
          <TextField
            className={styles.periodDate}
            label="Desde"
            type="date"
            value={range.dateFrom}
            onChange={(event) => changeDate('dateFrom', event.target.value)}
          />
          <span className={styles.periodSeparator} aria-hidden="true">
            –
          </span>
          <TextField
            className={styles.periodDate}
            label="Hasta"
            type="date"
            value={range.dateTo}
            onChange={(event) => changeDate('dateTo', event.target.value)}
          />
        </div>
      </div>

      {report && <DataQualityAlert rows={rows} onShow={showAlertRows} onRequest={() => setRequestOpen(true)} />}
      <RequestReportDataDialog open={requestOpen} teamId={team.id} rows={rows} onClose={() => setRequestOpen(false)} />

      {report && (
        <SummaryStrip
          report={report}
          rows={rows}
          currentUserId={currentUserId}
          includePending={includePending}
          onIncludePendingChange={setIncludePending}
        />
      )}

      <Card>
        <div className={styles.toolbar}>
          <div className={styles.chips}>
            {(['all', ...PARTICIPATION_STATUSES] as const).map((status) => {
              const count = status === 'all' ? rows.length : rows.filter((row) => row.participation.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  className={[styles.chip, statusFilter === status ? styles.chipActive : ''].filter(Boolean).join(' ')}
                  aria-pressed={statusFilter === status}
                  onClick={() => {
                    setStatusFilter(status);
                    resetPage();
                  }}
                >
                  {status !== 'all' && <span className={[styles.chipDot, STATUS_CLASS[status]].join(' ')} aria-hidden="true" />}
                  {status === 'all' ? 'Todos' : PARTICIPATION_STATUS_LABELS[status]}
                  <small className={styles.chipCount}>{count}</small>
                </button>
              );
            })}
            {alertFilter && (
              <button
                type="button"
                className={[styles.chip, styles.chipTag].join(' ')}
                title="Quitar este filtro"
                onClick={() => showAlertRows('')}
              >
                {ALERT_FILTER_LABELS[alertFilter]} ✕
              </button>
            )}
            {hasFilters && (
              <button type="button" className={styles.linkButton} onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
          <div className={styles.toolbarRight}>
            <TextField
              className={styles.search}
              type="search"
              aria-label="Buscar"
              placeholder="Buscar proyecto, cliente o comentario"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              iconLeft={<SearchIcon size={16} />}
            />
            <Select
              className={styles.memberSelect}
              aria-label="Colaborador"
              options={[
                { value: '', label: 'Colaborador: todos' },
                ...members.map((member) => ({
                  value: member.id,
                  label: member.fullName,
                })),
              ]}
              value={memberUserId}
              onChange={(event) => {
                onMemberChange(event.target.value);
                resetPage();
              }}
            />
          </div>
        </div>

        <div ref={tableRef}>
          <ReportTable
            team={team}
            members={members}
            rows={pageRows}
            allRows={visibleRows}
            loading={isLoading}
            error={error ? 'No se pudo cargar el reporte del equipo.' : null}
            sort={sort}
            onSort={toggleSort}
            onClearFilters={clearFilters}
            isAccumulated={preset === 'accumulated'}
          />
        </div>

        <Pagination
          page={currentPage}
          pageCount={pageCount}
          total={visibleRows.length}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            resetPage();
          }}
        />

        <p className={styles.footNote}>
          HH Incurridas del {formatDmy(range.dateFrom)} al {formatDmy(range.dateTo)}. <b>Incurridas vs. Asignadas</b> siempre es acumulado:
          desde el inicio de cada proyecto hasta el {formatDmy(range.dateTo)}. Negativo = el área consumió más HH de las asignadas.
        </p>
      </Card>
    </>
  );
}

function DataQualityAlert({
  rows,
  onShow,
  onRequest,
}: {
  rows: readonly TeamReportRow[];
  onShow: (filter: AlertFilter) => void;
  onRequest: () => void;
}) {
  const missingAssigned = rows.filter((row) => row.missingAssigned).length;
  const missingDates = rows.filter((row) => row.missingDates).length;
  if (missingAssigned === 0 && missingDates === 0) return null;

  return (
    <div className={styles.alert} role="status">
      <TriangleAlertIcon size={18} className={styles.alertIcon} />
      <p className={styles.alertText}>
        {missingAssigned > 0 && (
          <>
            <b>{plural(missingAssigned, 'proyecto')}</b> {missingAssigned === 1 ? 'tiene' : 'tienen'} HH incurridas pero ninguna HH Asignada
            al área{' '}
            <button type="button" className={styles.linkButton} onClick={() => onShow('missing_assigned')}>
              Ver
            </button>
          </>
        )}
        {missingAssigned > 0 && missingDates > 0 && ' · '}
        {missingDates > 0 && (
          <>
            <b>{missingDates}</b> no {missingDates === 1 ? 'tiene' : 'tienen'} fechas completas{' '}
            <button type="button" className={styles.linkButton} onClick={() => onShow('missing_dates')}>
              Ver
            </button>
          </>
        )}
        . Estos datos los carga el Líder PM de cada proyecto.
      </p>
      <Button variant="outlineDark" size="sm" onClick={onRequest}>
        Pedir datos a los Líderes PM
      </Button>
    </div>
  );
}

function SummaryStrip({
  report,
  rows,
  currentUserId,
  includePending,
  onIncludePendingChange,
}: {
  report: TeamReportResponse;
  rows: readonly TeamReportRow[];
  currentUserId: string | undefined;
  includePending: boolean;
  onIncludePendingChange: (value: boolean) => void;
}) {
  const totals = sumReportRows(rows);
  const pending = pendingHoursInPeriod(report);
  const inProgress = rows.filter((row) => row.participation.status === 'in_progress').length;
  const me = report.members.find((member) => member.id === currentUserId);
  const myHours = me ? (totals.byUser.get(me.id) ?? 0) : 0;

  return (
    <Card>
      <div className={styles.strip}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Proyectos en el reporte</span>
          <b className={styles.statValue}>{rows.length}</b>
          <small className={styles.statHint}>{inProgress} en proceso</small>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>HH Asignadas al área</span>
          <b className={styles.statValue}>{formatReportHours(totals.assigned)}</b>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>HH Incurridas en el período</span>
          <b className={styles.statValue}>{formatReportHours(totals.total)}</b>
          {pending > 0 && (
            <label className={styles.pendingToggle} title="HH ya registradas que aún no has aprobado">
              <input type="checkbox" checked={includePending} onChange={(event) => onIncludePendingChange(event.target.checked)} />
              Incluir {formatReportHours(pending)} HH pendientes
            </label>
          )}
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Incurridas vs. Asignadas (acumulado)</span>
          <b className={[styles.statValue, totals.balance < 0 ? styles.negative : ''].filter(Boolean).join(' ')}>
            {totals.balance === 0 ? '0' : formatReportHours(totals.balance)}
          </b>
        </div>
        {me && (
          <div className={styles.stat}>
            <span className={styles.statLabel}>Mis HH ({me.fullName.split(' ')[0]})</span>
            <b className={styles.statValue}>{formatReportHours(myHours)}</b>
            <small className={styles.statHint}>
              {totals.total ? Math.round((myHours / totals.total) * 100) : 0}% de las HH del período
            </small>
          </div>
        )}
      </div>
    </Card>
  );
}

interface ReportTableProps {
  team: { id: string; slug?: string | null };
  members: TeamReportResponse['members'];
  rows: readonly TeamReportRow[];
  /** Todas las filas filtradas (no solo la página) — base de la fila de totales. */
  allRows: readonly TeamReportRow[];
  loading: boolean;
  error: string | null;
  sort: SortState<SortField> | null;
  onSort: (field: SortField) => void;
  onClearFilters: () => void;
  isAccumulated: boolean;
}

function ReportTable({ team, members, rows, allRows, loading, error, sort, onSort, onClearFilters, isAccumulated }: ReportTableProps) {
  const toast = useToast();
  const updateComment = useUpdateTeamReportComment(team.id);
  const [hovered, setHovered] = useState<{
    row: TeamReportRow;
    rect: DOMRect;
  } | null>(null);
  const columnCount = 8 + members.length;
  const totals = sumReportRows(allRows);

  const sortHeader = (field: SortField, label: string, className?: string, tooltip?: string) => (
    <th
      scope="col"
      rowSpan={2}
      className={[styles.sortable, className].filter(Boolean).join(' ')}
      title={tooltip}
      aria-sort={sort?.field === field ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={styles.headerButton} onClick={() => onSort(field)}>
        {label}
        {sort?.field === field && <span className={styles.sortArrow}>{sort.direction === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  const saveComment = (projectId: string, comment: string) => {
    updateComment.mutate(
      { projectId, comment },
      {
        onSuccess: () => toast.success('Comentario guardado'),
        onError: () => toast.error('No se pudo guardar el comentario.'),
      },
    );
  };

  return (
    <div className={styles.tableWrap} onScroll={() => setHovered(null)}>
      <table className={styles.table} style={{ minWidth: 1220 + members.length * 80 }}>
        <caption className="srOnly">Proyectos del equipo</caption>
        <colgroup>
          <col style={{ width: 264 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 140 }} />
          {members.map((member) => (
            <col key={member.id} style={{ width: 80 }} />
          ))}
          <col style={{ width: 76 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 300 }} />
        </colgroup>
        <thead>
          <tr>
            {sortHeader('project', 'Proyecto', styles.sticky)}
            {sortHeader('startDate', 'Fecha Inicio')}
            {sortHeader('endDate', 'Fecha Término')}
            {sortHeader('assigned', 'HH Asignadas', styles.num)}
            {sortHeader('status', 'Estado', undefined, 'Se calcula solo desde el estado del proyecto y las tareas asignadas al equipo')}
            <th
              scope="colgroup"
              colSpan={members.length + 1}
              // Con muchas personas el centro del grupo queda fuera de la vista inicial: se alinea a la izquierda.
              className={[styles.group, styles.divider, members.length > 6 ? styles.groupStart : ''].filter(Boolean).join(' ')}
            >
              HH Incurridas
            </th>
            {sortHeader(
              'balance',
              'Incurridas vs. Asignadas',
              [styles.num, styles.divider].join(' '),
              'HH Asignadas − HH incurridas acumuladas desde el inicio del proyecto hasta el fin del período',
            )}
            <th scope="col" rowSpan={2}>
              Comentarios
            </th>
          </tr>
          <tr>
            {members.map((member, index) => (
              <th key={member.id} scope="col" className={[styles.num, index === 0 ? styles.divider : ''].filter(Boolean).join(' ')}>
                {member.fullName.split(' ').slice(0, 2).join(' ')}
              </th>
            ))}
            <th
              scope="col"
              className={[styles.num, styles.sortable, members.length === 0 ? styles.divider : ''].filter(Boolean).join(' ')}
              aria-sort={sort?.field === 'total' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button type="button" className={styles.headerButton} onClick={() => onSort('total')}>
                Total HH
                {sort?.field === 'total' && <span className={styles.sortArrow}>{sort.direction === 'asc' ? '▲' : '▼'}</span>}
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan={columnCount} className={styles.stateCell}>
                Cargando…
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={columnCount} className={styles.stateCell}>
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className={styles.stateCell}>
                No hay proyectos con estos filtros.{' '}
                <button type="button" className={styles.linkButton} onClick={onClearFilters}>
                  Limpiar filtros
                </button>
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            rows.map((row) => {
              const { project } = row;
              return (
                <tr key={project.projectId} className={row.participation.status === 'not_started' ? styles.rowMuted : undefined}>
                  <td
                    className={styles.sticky}
                    onMouseEnter={(event) =>
                      setHovered({
                        row,
                        rect: event.currentTarget.getBoundingClientRect(),
                      })
                    }
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div className={styles.projectCell}>
                      <span className={[styles.avatar, project.responsible ? '' : styles.avatarEmpty].filter(Boolean).join(' ')}>
                        {project.responsible ? personInitials(project.responsible.fullName) : '–'}
                      </span>
                      <div className={styles.projectText}>
                        <Link to={projectTeamPath({ id: project.projectId, slug: project.slug }, team)} className={styles.projectName}>
                          {project.name}
                        </Link>
                        <span className={styles.projectClient}>{project.client?.companyName ?? 'Sin cliente'}</span>
                      </div>
                    </div>
                  </td>
                  <DateCell iso={project.startDate} project={project} />
                  <DateCell iso={project.endDate} project={project} />
                  <td className={styles.num}>
                    {row.missingAssigned ? (
                      <MissingData project={project} label="Sin asignar" hint="La asigna el Líder PM" />
                    ) : row.assigned ? (
                      formatReportHours(row.assigned)
                    ) : (
                      <span className={styles.muted}>–</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={[styles.status, STATUS_CLASS[row.participation.status]].join(' ')}
                      title={`${row.participation.reason} Se actualiza sola.`}
                    >
                      {PARTICIPATION_STATUS_LABELS[row.participation.status]}
                    </span>
                  </td>
                  {members.map((member, index) => {
                    const hours = row.hoursByUser.get(member.id) ?? 0;
                    const pending = row.pendingByUser.get(member.id);
                    return (
                      <td key={member.id} className={[styles.num, index === 0 ? styles.divider : ''].filter(Boolean).join(' ')}>
                        {hours ? formatReportHours(hours) : <span className={styles.muted}>–</span>}
                        {pending && (
                          <i className={styles.pendingDot} title={`Incluye ${formatReportHours(pending)} HH pendientes de aprobación`} />
                        )}
                      </td>
                    );
                  })}
                  <td className={[styles.num, styles.bold, members.length === 0 ? styles.divider : ''].filter(Boolean).join(' ')}>
                    {formatReportHours(row.total)}
                  </td>
                  <BalanceCell assigned={row.assigned} accumulated={row.accumulated} detailed />
                  <td className={styles.commentCell}>
                    <CommentField
                      key={`${project.projectId}:${project.comment ?? ''}`}
                      value={project.comment ?? ''}
                      onSave={(comment) => saveComment(project.projectId, comment)}
                    />
                  </td>
                </tr>
              );
            })}
        </tbody>

        {!loading && !error && allRows.length > 0 && (
          <tfoot>
            <tr>
              <td className={styles.sticky}>Total · {plural(allRows.length, 'proyecto')}</td>
              <td />
              <td />
              <td className={styles.num}>{formatReportHours(totals.assigned)}</td>
              <td />
              {members.map((member, index) => (
                <td key={member.id} className={[styles.num, index === 0 ? styles.divider : ''].filter(Boolean).join(' ')}>
                  {formatReportHours(totals.byUser.get(member.id) ?? 0)}
                </td>
              ))}
              <td className={[styles.num, members.length === 0 ? styles.divider : ''].filter(Boolean).join(' ')}>
                {formatReportHours(totals.total)}
              </td>
              <BalanceCell assigned={totals.assigned} accumulated={totals.accumulated} />
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      {hovered && (
        <ProjectCard
          row={hovered.row}
          anchor={hovered.rect}
          members={members}
          isAccumulated={isAccumulated}
          onDismiss={() => setHovered(null)}
        />
      )}
    </div>
  );
}

function DateCell({ iso, project }: { iso: string | null; project: TeamReportProject }) {
  return <td>{iso ? formatDayMonth(iso) : <MissingData project={project} label="Sin fecha" hint="Lo carga el Líder PM" />}</td>;
}

/** Dato que carga el Líder PM y falta — o "Solicitada ✓" si ya se le pidió desde el reporte. */
function MissingData({ project, label, hint }: { project: TeamReportProject; label: string; hint: string }) {
  const leader = project.projectLeader?.fullName;
  if (project.dataRequestedAt) {
    return (
      <span
        className={[styles.missing, styles.missingRequested].join(' ')}
        title={`Solicitada el ${formatDmy(project.dataRequestedAt.slice(0, 10))}${leader ? ` a ${leader}` : ''}. Se actualiza sola cuando complete el dato.`}
      >
        Solicitada ✓
      </span>
    );
  }
  return (
    <span className={styles.missing} title={`${hint}${leader ? ` (${leader})` : ''}`}>
      {label}
    </span>
  );
}

function BalanceCell({ assigned, accumulated, detailed = false }: { assigned: number; accumulated: number; detailed?: boolean }) {
  const balance = Math.round((assigned - accumulated) * 100) / 100;
  if (assigned === 0 && accumulated === 0) {
    return (
      <td className={[styles.num, styles.divider].join(' ')}>
        <span className={styles.muted}>–</span>
      </td>
    );
  }
  const detail = detailed
    ? `Asignadas ${formatReportHours(assigned)} − incurridas ${formatReportHours(accumulated)}${
        assigned > 0 ? ` · consumió el ${Math.round((accumulated / assigned) * 100)}% de lo asignado` : ' · sin HH asignadas'
      }`
    : undefined;
  return (
    <td className={[styles.num, styles.divider, styles.bold, balance < 0 ? styles.negative : ''].filter(Boolean).join(' ')} title={detail}>
      {balance === 0 ? '0' : formatReportHours(balance)}
    </td>
  );
}

/**
 * Comentario editable en la misma celda: se guarda al salir del campo (o con Enter) solo si
 * cambió, y Escape descarta lo escrito. Sin estado React del texto mientras se escribe —
 * el nodo editable es la fuente de verdad hasta el blur, y `key` lo reinicia al guardarse.
 */
function CommentField({ value, onSave }: { value: string; onSave: (comment: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const commit = () => {
    const text = (ref.current?.innerText ?? '').replace(/\s+/g, ' ').trim();
    if (text !== value.trim()) onSave(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.currentTarget.innerText = value;
      event.currentTarget.blur();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  };

  return (
    <div
      ref={ref}
      className={styles.comment}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Comentario"
      data-placeholder="Agregar comentario…"
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      {value}
    </div>
  );
}

/** Tarjeta de detalle al pasar el mouse por el proyecto — se posiciona a la derecha de la celda, o a la izquierda si no cabe. */
function ProjectCard({
  row,
  anchor,
  members,
  isAccumulated,
  onDismiss,
}: {
  row: TeamReportRow;
  anchor: DOMRect;
  members: TeamReportResponse['members'];
  isAccumulated: boolean;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const { project } = row;

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const { offsetWidth: width, offsetHeight: height } = card;
    let left = anchor.right + 10;
    if (left + width > window.innerWidth - 8) left = Math.max(8, anchor.left - width - 10);
    let top = anchor.top;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    window.addEventListener('scroll', onDismiss, true);
    return () => window.removeEventListener('scroll', onDismiss, true);
  }, [onDismiss]);

  const workers = members
    .map((member) => ({ member, hours: row.hoursByUser.get(member.id) ?? 0 }))
    .filter((item) => item.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const dates = `${project.startDate ? formatDayMonth(project.startDate) : 'sin fecha de inicio'} → ${
    project.endDate ? formatDayMonth(project.endDate) : 'sin fecha de término'
  }`;

  return (
    <div
      ref={ref}
      className={styles.card}
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
      role="tooltip"
    >
      <div className={styles.cardTitle}>{project.name}</div>
      <div className={styles.cardSub}>
        {project.client?.companyName ?? 'Sin cliente'} · {dates}
        <br />
        Responsable: {project.responsible?.fullName ?? 'sin responsable'}
      </div>
      <div className={styles.cardStats}>
        <div>
          <span>HH Asignadas</span>
          <b>{row.assigned ? formatReportHours(row.assigned) : 'Sin asignar'}</b>
        </div>
        <div>
          <span>{isAccumulated ? 'HH Incurridas' : 'Incurridas en el período'}</span>
          <b>{formatReportHours(row.total)}</b>
        </div>
        {!isAccumulated && (
          <div>
            <span>Incurridas acumuladas</span>
            <b>{formatReportHours(row.accumulated)}</b>
          </div>
        )}
        <div>
          <span>Incurridas vs. Asignadas</span>
          <b className={row.balance < 0 ? styles.negative : undefined}>
            {row.accumulated === 0 && row.assigned === 0 ? '–' : row.balance === 0 ? '0' : formatReportHours(row.balance)}
          </b>
        </div>
      </div>
      <div className={styles.cardWhy}>
        <span className={[styles.status, STATUS_CLASS[row.participation.status]].join(' ')}>
          {PARTICIPATION_STATUS_LABELS[row.participation.status]}
        </span>
        <div>{row.participation.reason}</div>
      </div>
      <div className={styles.cardHeading}>Quiénes trabajaron</div>
      {workers.length === 0 ? (
        <div className={styles.muted}>Sin HH en el período.</div>
      ) : (
        workers.map(({ member, hours }) => {
          const share = row.total ? Math.round((hours / row.total) * 100) : 0;
          return (
            <div key={member.id} className={styles.cardWorker}>
              <span>
                {member.fullName}
                {project.responsible?.id === member.id && <small> · responsable</small>}
              </span>
              <span className={styles.bold}>
                {formatReportHours(hours)} <small>{share}%</small>
              </span>
              <div className={styles.cardBar}>
                <i style={{ width: `${share}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
