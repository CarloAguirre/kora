import { useMemo, useState } from 'react';
import type { DashboardOvertimeReportRow } from '@kora/contracts';
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
const ALL_LEADERS = 'all';
const NO_LEADER = 'none';
const NO_ROWS: readonly DashboardOvertimeReportRow[] = [];

const leaderKey = (row: DashboardOvertimeReportRow) => row.leaderUserId ?? NO_LEADER;

const COLUMNS: Column<DashboardOvertimeReportRow>[] = [
  { key: 'project', header: 'Proyecto', render: (row) => row.projectName },
  {
    key: 'leader',
    header: 'Líder',
    render: (row) => row.leaderFullName ?? <span className={styles.muted}>Sin líder</span>,
  },
  { key: 'user', header: 'Colaborador', render: (row) => row.userFullName },
  { key: 'approved', header: 'Aprobadas', align: 'right', render: (row) => `${formatHours(row.approvedHours)} h` },
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
 * "Horas extra por proyecto" — vista general del PMO: horas extra de un mes en
 * los proyectos de soporte, por proyecto × colaborador con su líder, filtrable
 * por líder y exportable a Excel. En soporte lo que pasa de la jornada de 8h
 * queda solo como horas extra (ver `CreateTicketHhRequestUseCase`).
 */
export function OvertimeReportSection() {
  const today = new Date();
  const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [leader, setLeader] = useState(ALL_LEADERS);
  const { data, isLoading, error } = useOvertimeReport(period.year, period.month);

  const rows = data?.rows ?? NO_ROWS;
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
  const projectCount = new Set(filtered.map((row) => row.projectId)).size;
  const userCount = new Set(filtered.map((row) => row.userId)).size;
  const leaderLabel = leaderOptions.find((option) => option.value === leader)?.label ?? 'Todos los líderes';

  const changePeriod = (next: { year: number; month: number }) => {
    setPeriod(next);
    setLeader(ALL_LEADERS);
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>Horas extra por proyecto</span>
          <p className={styles.subtitle}>Proyectos de soporte, por líder y colaborador</p>
        </div>
        <div className={styles.controls}>
          <PeriodSelector year={period.year} month={period.month} onChange={changePeriod} />
          <Select
            aria-label="Líder"
            className={styles.leaderSelect}
            options={leaderOptions}
            value={leader}
            onChange={(event) => setLeader(event.target.value)}
          />
          <Button
            variant="outlineDark"
            iconLeft={<DownloadIcon size={16} />}
            disabled={filtered.length === 0}
            onClick={() => exportOvertimeReport(filtered, period.year, period.month, leaderLabel)}
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
        getRowKey={(row) => `${row.projectId}:${row.userId}`}
        loading={isLoading}
        error={error ? 'No se pudieron cargar las horas extra.' : null}
        emptyMessage="No hay horas extra registradas en este período."
      />
      {filtered.length > 0 && <Pagination {...pagination} />}
    </Card>
  );
}
