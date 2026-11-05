import type {
  DashboardHoursSummary,
  DashboardMyPlanning,
  DashboardMyTask,
  DashboardPlanningItem,
} from '@kora/contracts';
import { FORECAST_ASSIGNMENT_TYPE_LABELS } from '@kora/contracts';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
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

/** KPI autorizados de /dashboard/summary, sin sumar aprobaciones de tareas como HH consumidas. */
export function CollaboratorKpis({ hours, tasks, loading }: OverviewProps) {
  const inReviewCount = tasks.filter((task) => task.status === 'in_review').length;
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

  return (
    <div className={styles.kpis} aria-label="Indicadores de mi actividad">
      <section className={styles.kpiCard} aria-label="Progreso diario">
        <span className={styles.kpiLabel}>Progreso Diario</span>
        {unavailable ? <span className={styles.muted}>{loading ? 'Cargando…' : 'No disponible'}</span>
          : <div className={styles.donutRow}>
              <DailyDonut percent={dailyPercent} />
              <div><strong className={styles.value}>{formatHours(today)}/{DAILY_TARGET_HOURS}</strong>
                <span className={styles.muted}>Horas hoy</span></div>
            </div>}
      </section>
      <section className={styles.kpiCard} aria-label="Horas registradas esta semana">
        <span className={styles.kpiLabel}>HH registradas esta semana</span>
        {unavailable ? <span className={styles.muted}>{loading ? 'Cargando…' : 'No disponible'}</span>
          : <>
              <strong className={styles.value}>{formatHours(weekly)}/{formatHours(target)} horas</strong>
              <div className={styles.progressTrack} role="progressbar"
                aria-label="Progreso de horas semanales" aria-valuenow={weeklyPercent}
                aria-valuemin={0} aria-valuemax={100}>
                <span className={styles.progressFill} style={{ width: String(weeklyPercent) + '%' }} />
              </div>
              <span className={styles.muted}>
                {weeklyPercent}% completado
                {hours.weekHolidayCount > 0 ? ' · ' + hours.weekHolidayCount + ' feriado(s) descontado(s)' : ''}
              </span>
            </>}
      </section>
      <section className={styles.kpiCard} aria-label="Horas extra este mes">
        <span className={styles.kpiLabel}>Horas extra este mes</span>
        {unavailable ? <span className={styles.muted}>{loading ? 'Cargando…' : 'No disponible'}</span>
          : <>
              <strong className={styles.value}>{formatHours(hours.monthOvertimeHours)} horas</strong>
              <span className={styles.muted}>{formatHours(hours.weekOvertimeHours)} h esta semana</span>
            </>}
      </section>
      <section className={styles.kpiCard} aria-label="Atención requerida">
        <span className={styles.kpiLabel}>Atención Requerida</span>
        {loading ? <span className={styles.muted}>Cargando…</span>
          : inReviewCount + returnedCount + rejectedEntries === 0
            ? <span className={styles.allClear}>Todo al día</span>
            : <div className={styles.attention}>
                {inReviewCount > 0 && <strong>{inReviewCount} {inReviewCount === 1
                  ? 'tarea esperando revisión' : 'tareas esperando revisión'}</strong>}
                {returnedCount > 0 && <span>{returnedCount} {returnedCount === 1
                  ? 'tarea devuelta por el líder' : 'tareas devueltas por el líder'}</span>}
                {rejectedEntries > 0 && <span>{rejectedEntries} {rejectedEntries === 1
                  ? 'registro de horas rechazado' : 'registros de horas rechazados'}</span>}
              </div>}
      </section>
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
export function CollaboratorPlanning({ planning, loading }: PlanningProps) {
  const teamMembers = planning?.teamMembers ?? EMPTY_TEAM;
  const { pageItems, pagination } = usePaginatedItems(teamMembers);
  return (
    <div className={styles.planningGrid}>
      <section className={styles.planningCard} aria-label="Planificación semanal">
        <div className={styles.sectionHeading}>
          <h2>Planificación Semanal</h2>
          {planning && <span>{formatWeek(planning.weekStart)}</span>}
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th>Proyecto / tipo</th><th className={styles.numeric}>HH semana</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={2}>Cargando planificación…</td></tr>
                : !planning || planning.items.length === 0
                  ? <tr><td colSpan={2}>Sin horas planificadas esta semana.</td></tr>
                  : planning.items.map((item, index) => <tr key={item.type + '-' + (item.projectName ?? index)}>
                      <td>{planningLabel(item)}</td>
                      <td className={styles.numeric}>{formatHours(item.hours)} HH</td>
                    </tr>)}
              {planning && <tr className={styles.totalRow}>
                <td>Total semana</td><td className={styles.numeric}>{formatHours(planning.totalHours)} HH</td>
              </tr>}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>HH asignadas en planificación; no equivalen a horas registradas.</p>
      </section>
      <section className={styles.planningCard} aria-label="Mi equipo">
        <div className={styles.sectionHeading}>
          <h2>Mi Equipo{planning?.teamName ? ' — ' + planning.teamName : ''}</h2>
          {!loading && <span className={styles.count}>{teamMembers.length}</span>}
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th>Colaborador</th><th>Proyectos esta semana</th>
              <th className={styles.numeric}>HH semana</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={3}>Cargando equipo…</td></tr>
                : teamMembers.length === 0 ? <tr><td colSpan={3}>Sin compañeros de equipo disponibles.</td></tr>
                : pageItems.map((member) => <tr key={member.fullName}>
                    <td>{member.fullName}</td>
                    <td>{member.items.length ? member.items.map(planningLabel).join(', ') : 'Sin asignaciones'}</td>
                    <td className={styles.numeric}>{formatHours(member.totalHours)} HH</td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        {teamMembers.length > 0 && <Pagination {...pagination} />}
        <p className={styles.caption}>Asignación semanal del equipo; no expone bitácoras privadas de otros usuarios.</p>
      </section>
    </div>
  );
}
