import { useMemo, useState } from 'react';
import { PROJECT_TYPE_LABELS, PROJECT_TYPES, type DashboardOvertimeReportRow } from '@kora/contracts';
import styles from './OvertimeReportSection.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { PeriodSelector } from '@/shared/components/ui/PeriodSelector';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { DownloadIcon } from '@/shared/components/icons/Icons';
import { useOvertimeReport } from '../api/dashboard.queries';
import { exportOvertimeReport } from '../lib/overtime-report-export';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
const ALL_LEADERS = 'all';
const ALL_TYPES = 'all';
const TYPE_OPTIONS = [
  { value: ALL_TYPES, label: 'Todos los tipos' },
  ...PROJECT_TYPES.map((type) => ({ value: type, label: PROJECT_TYPE_LABELS[type] })),
];
const NO_LEADER = 'none';
const NO_ROWS: readonly DashboardOvertimeReportRow[] = [];

const leaderKey = (row: DashboardOvertimeReportRow) => row.leaderUserId ?? NO_LEADER;

const COLUMNS: Column<DashboardOvertimeReportRow>[] = [
  { key: 'date', header: 'Fecha', render: (row) => <span className={styles.date}>{formatDate(row.date)}</span> },
  {
    key: 'project',
    header: 'Proyecto',
    render: (row) => row.projectName ?? <span className={styles.muted}>Sin proyecto</span>,
  },
  {
    key: 'type',
    header: 'Tipo',
    render: (row) => (row.projectType ? PROJECT_TYPE_LABELS[row.projectType] : <span className={styles.muted}>—</span>),
  },
  {
    key: 'leader',
    header: 'Líder',
    render: (row) => row.leaderFullName ?? <span className={styles.muted}>Sin líder</span>,
  },
  { key: 'user', header: 'Colaborador', render: (row) => row.userFullName },
  {
    key: 'approved',
    header: 'Aprobadas',
    align: 'right',
    render: (row) => (row.approvedHours > 0 ? `${formatHours(row.approvedHours)} h` : <span className={styles.muted}>—</span>),
  },
  {
    key: 'pending',
    header: 'Pendientes',
    align: 'right',
    render: (row) => (row.pendingHours > 0 ? `${formatHours(row.pendingHours)} h` : <span className={styles.muted}>—</span>),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    render: (row) => <strong>{formatHours(row.approvedHours + row.pendingHours)} h</strong>,
  },
];

/**
 * "Horas extra por proyecto" — horas extra de un mes en proyectos de soporte y
 * desarrollo, por día × proyecto × colaborador con su líder, filtrable por tipo
 * y exportable a Excel. Incluye las horas extra sin proyecto. Lo que pasa de la
 * jornada de 8h del día queda solo como horas extra (ver `splitByDailyCap`), así
 * que estas horas y las de Capacity (solo normales) no se pisan.
 *
 * `scope="all"`: vista general del PMO (Administración), filtrable por líder.
 * `scope="team"`: Dashboard del líder — el backend ya acota a las personas a
 * su cargo, así que el filtro por líder sobra.
 */
export function OvertimeReportSection({ scope = 'all' }: { scope?: 'all' | 'team' }) {
  const isTeam = scope === 'team';
  const today = new Date();
  const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [leader, setLeader] = useState(ALL_LEADERS);
  const [type, setType] = useState(ALL_TYPES);
  const { data, isLoading, error } = useOvertimeReport(period.year, period.month);

  const allRows = data?.rows ?? NO_ROWS;
  const rows = useMemo(() => (type === ALL_TYPES ? allRows : allRows.filter((row) => row.projectType === type)), [allRows, type]);
  const leaderOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of rows) byKey.set(leaderKey(row), row.leaderFullName ?? 'Sin líder');
    return [
      { value: ALL_LEADERS, label: 'Todos los líderes' },
      ...[...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);
  const filtered = useMemo(
    () => (leader === ALL_LEADERS ? rows : rows.filter((row) => leaderKey(row) === leader)),
    [rows, leader],
  );
  const { pageItems, pagination } = usePaginatedItems(filtered);

  const approvedHours = filtered.reduce((sum, row) => sum + row.approvedHours, 0);
  const pendingHours = filtered.reduce((sum, row) => sum + row.pendingHours, 0);
  const projectCount = new Set(filtered.flatMap((row) => (row.projectId ? [row.projectId] : []))).size;
  const userCount = new Set(filtered.map((row) => row.userId)).size;
  const leaderLabel = leaderOptions.find((option) => option.value === leader)?.label ?? 'Todos los líderes';
  const typeLabel = TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Todos los tipos';

  const changeType = (next: string) => {
    setType(next);
    setLeader(ALL_LEADERS);
  };

  const changePeriod = (next: { year: number; month: number }) => {
    setPeriod(next);
    setType(ALL_TYPES);
    setLeader(ALL_LEADERS);
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>{isTeam ? 'Horas extra de mi equipo' : 'Horas extra por proyecto'}</span>
          <p className={styles.subtitle}>
            {isTeam
              ? 'Personas a tu cargo, en proyectos de desarrollo y soporte'
              : 'Proyectos de desarrollo y soporte, por líder y colaborador'}
          </p>
        </div>
        <div className={styles.controls}>
          <PeriodSelector year={period.year} month={period.month} onChange={changePeriod} />
          <Select
            aria-label="Tipo de proyecto"
            className={styles.typeSelect}
            options={TYPE_OPTIONS}
            value={type}
            onChange={(event) => changeType(event.target.value)}
          />
          {!isTeam && (
            <Select
              aria-label="Líder"
              className={styles.leaderSelect}
              options={leaderOptions}
              value={leader}
              onChange={(event) => setLeader(event.target.value)}
            />
          )}
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={16} />}
            disabled={filtered.length === 0}
            onClick={() =>
              exportOvertimeReport(filtered, period.year, period.month, {
                type: typeLabel,
                leader: isTeam ? 'Personas a mi cargo' : leaderLabel,
              })
            }
          >
            Exportar
          </Button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total horas extra</span>
          <span className={styles.statValue}>{isLoading ? '…' : `${formatHours(approvedHours + pendingHours)} h`}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Aprobadas</span>
          <span className={styles.statValue}>{isLoading ? '…' : `${formatHours(approvedHours)} h`}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Pendientes</span>
          <span className={styles.statValue}>{isLoading ? '…' : `${formatHours(pendingHours)} h`}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Proyectos</span>
          <span className={styles.statValue}>{isLoading ? '…' : projectCount}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Colaboradores</span>
          <span className={styles.statValue}>{isLoading ? '…' : userCount}</span>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        items={pageItems}
        getRowKey={(row) => `${row.date}:${row.projectId}:${row.userId}`}
        loading={isLoading}
        error={error ? 'No se pudieron cargar las horas extra.' : null}
        emptyMessage="No hay horas extra registradas en este período."
      />
      {filtered.length > 0 && <Pagination {...pagination} />}
    </Card>
  );
}
