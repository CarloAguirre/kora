import type {
  DashboardHoursSummary,
  DashboardMyPlanning,
  DashboardMyTask,
  DashboardPlanningItem,
} from '@kora/contracts';
import { FORECAST_ASSIGNMENT_TYPE_LABELS } from '@kora/contracts';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { Card } from '@/shared/components/ui/Card';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import styles from './CollaboratorOverviewSections.module.css';

const DAILY_TARGET_HOURS = 8;
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const planningLabel = (item: DashboardPlanningItem) =>
  item.projectName ?? FORECAST_ASSIGNMENT_TYPE_LABELS[item.type];

interface OverviewProps {
  hours: DashboardHoursSummary | null;
  tasks: readonly DashboardMyTask[];
  loading: boolean;
}

function DailyDonut({ percent }: { percent: number }) {
  const radius = 29;
  const length = 2 * Math.PI * radius;
  return (
    <svg className={styles.donut} width="70" height="70" viewBox="0 0 70 70"
      role="img" aria-label={String(Math.round(percent)) + '% de la jornada registrada'}>
      <circle cx="35" cy="35" r={radius} strokeWidth="6" stroke="#e6eaf1" fill="none" />
      <circle cx="35" cy="35" r={radius} strokeWidth="6" stroke="var(--kora-success)"
        fill="none" strokeDasharray={length} strokeDashoffset={length * (1 - percent / 100)}
        strokeLinecap="round" transform="rotate(-90 35 35)" />
      <text x="35" y="39" textAnchor="middle" className={styles.donutText}>
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

/** Solo acciones del propio colaborador. 'in_review' espera decisión del líder, no requiere su acción. */
export function CollaboratorKpis({ hours, tasks, loading }: OverviewProps) {
  const returnedCount = tasks.filter((task) =>
    (task.status === 'todo' || task.status === 'in_progress') && Boolean(task.rejectionReason),
  ).length;
  const rejectedEntries = hours?.rejectedCount ?? 0;
  const today = hours?.todayHours ?? 0;
  const weekly = hours?.weekHours ?? 0;
  const target = hours?.weekTargetHours ?? 0;
  const dailyPercent = Math.min(100, Math.max(0, today / DAILY_TARGET_HOURS * 100));
  const weeklyPercent = target > 0 ? Math.min(100, Math.round(weekly / target * 100)) : 100;
  const unavailable = loading || !hours;
  const fallback = <span className={styles.muted}>{loading ? 'Cargando…' : 'No disponible'}</span>;

  return (
    <div className={styles.kpis} aria-label="Indicadores de mi actividad">
      <KpiCard ariaLabel="Progreso diario" label="Progreso Diario" className={styles.kpiCard}
        value={unavailable ? fallback
          : <span className={styles.donutRow}>
              <DailyDonut percent={dailyPercent} />
              <span className={styles.donutValues}>
                <strong className={styles.donutNumber}>{formatHours(today)}/{DAILY_TARGET_HOURS}</strong>
                <span className={styles.muted}>Horas hoy</span>
              </span>
            </span>}
      />
      <KpiCard ariaLabel="Horas registradas esta semana" label="HH registradas esta semana"
        className={styles.kpiCard}
        value={unavailable ? fallback
          : <span className={styles.weeklyGroup}>
              <strong className={styles.weeklyNumber}>{formatHours(weekly)}/{formatHours(target)} horas</strong>
              <span className={styles.progressTrack} role="progressbar"
                aria-label="Progreso de horas semanales" aria-valuenow={weeklyPercent}
                aria-valuemin={0} aria-valuemax={100}>
                <span className={styles.progressFill} style={{ width: weeklyPercent + '%' }} />
              </span>
            </span>}
        sub={!unavailable
          ? weeklyPercent + '% completado' + ((hours?.weekHolidayCount ?? 0) > 0
            ? ' · ' + hours!.weekHolidayCount + ' feriado(s) descontado(s)' : '')
          : undefined}
      />
      <KpiCard ariaLabel="Horas extra este mes" label="Horas extra este mes"
        className={styles.kpiCard}
        value={unavailable ? fallback : formatHours(hours?.monthOvertimeHours ?? 0) + ' horas'}
        sub={!unavailable ? formatHours(hours?.weekOvertimeHours ?? 0) + ' h esta semana' : undefined}
      />
      <KpiCard ariaLabel="Atención requerida" label="Atención Requerida"
        className={styles.kpiCard}
        value={loading ? fallback : returnedCount + rejectedEntries === 0
          ? <span className={styles.allClear}>Todo al día</span>
          : <span className={styles.attention}>
              {returnedCount > 0 && <>
                <strong>{returnedCount} {returnedCount === 1
                  ? 'tarea por revisar' : 'tareas por revisar'}</strong>
                <span>{returnedCount} {returnedCount === 1
                  ? 'devuelta por el líder' : 'devueltas por el líder'}</span>
              </>}
              {rejectedEntries > 0 && <span>{rejectedEntries} {rejectedEntries === 1
                ? 'registro de horas rechazado' : 'registros de horas rechazados'}</span>}
            </span>}
      />
    </div>
  );
}

interface PlanningProps {
  planning: DashboardMyPlanning | null;
  loading: boolean;
}

const EMPTY_TEAM: NonNullable<DashboardMyPlanning['teamMembers']> = [];

const formatWeek = (iso: string) => {
  const date = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(date.valueOf())) return '';
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  const short = (value: Date) => value.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit',
  });
  return short(date) + ' – ' + short(end);
};

/** Mis asignaciones y las de mi equipo: cantidades planificadas, no HH registradas. */
type WeekRow = { readonly id: string; readonly label: string; readonly hours: number; readonly total: boolean };
type TeamMember = NonNullable<DashboardMyPlanning['teamMembers']>[number];

const weekColumns: readonly Column<WeekRow>[] = [
  { key: 'project', header: 'Proyecto / tipo', render: (row) => row.total
    ? <strong>{row.label}</strong> : row.label },
  { key: 'hours', header: 'HH semana', align: 'right', render: (row) => row.total
    ? <strong>{formatHours(row.hours)} HH</strong> : formatHours(row.hours) + ' HH' },
];
const teamColumns: readonly Column<TeamMember>[] = [
  { key: 'collaborator', header: 'Colaborador', render: (member) => member.fullName },
  { key: 'projects', header: 'Proyectos esta semana', render: (member) =>
    member.items.length ? member.items.map(planningLabel).join(', ') : 'Sin asignaciones' },
  { key: 'hours', header: 'HH semana', align: 'right', render: (member) =>
    formatHours(member.totalHours) + ' HH' },
];

/** Planificación autorizada: componentes DataTable y Pagination de Kora. */
export function CollaboratorPlanning({ planning, loading }: PlanningProps) {
  const teamMembers = planning?.teamMembers ?? EMPTY_TEAM;
  const { pageItems, pagination } = usePaginatedItems(teamMembers);
  const weekRows: WeekRow[] = planning
    ? [...planning.items.map((item, index) => ({
        id: item.type + '-' + (item.projectName ?? index),
        label: planningLabel(item), hours: item.hours, total: false,
      })), { id: '__total__', label: 'Total semana', hours: planning.totalHours, total: true }]
    : [];

  return (
    <div className={styles.planningGrid}>
      <Card className={styles.planningCard} role="region" aria-label="Planificación semanal">
        <div className={styles.sectionHeading}>
          <h2>Planificación Semanal</h2>
          {planning && <span>{formatWeek(planning.weekStart)}</span>}
        </div>
        <DataTable columns={weekColumns} items={weekRows} getRowKey={(row) => row.id}
          density="compact" loading={loading}
          getRowClassName={(row) => row.total ? styles.totalRow : undefined}
          emptyMessage="Sin horas planificadas esta semana."
          caption="Asignaciones de la semana" />
        <p className={styles.caption}>HH asignadas en planificación; no equivalen a horas registradas.</p>
      </Card>
      <Card className={styles.planningCard} role="region" aria-label="Mi equipo">
        <div className={styles.sectionHeading}>
          <h2>Mi Equipo{planning?.teamName ? ' — ' + planning.teamName : ''}</h2>
          {!loading && <span className={styles.count}>{teamMembers.length}</span>}
        </div>
        <DataTable columns={teamColumns} items={pageItems} getRowKey={(member) => member.fullName}
          density="compact" loading={loading}
          emptyMessage="Sin compañeros de equipo disponibles."
          caption="Planificación semanal de mi equipo" />
        {teamMembers.length > 0 && <Pagination {...pagination} />}
        <p className={styles.caption}>Asignación semanal del equipo; no expone bitácoras privadas de otros usuarios.</p>
      </Card>
    </div>
  );
}
