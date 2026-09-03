import {
  FORECAST_ASSIGNMENT_TYPE_LABELS,
  type DashboardHoursSummary,
  type DashboardMyActiveProject,
  type DashboardMyPlanning,
  type DashboardPlanningItem,
} from '@kora/contracts';
import styles from './MyActivityPanel.module.css';
import { Card } from '@/shared/components/ui/Card';
import { AlertIcon, CheckIcon, CalendarIcon } from '@/shared/components/icons/Icons';
import { RecentHistoryCard } from './RecentHistoryCard';

const DAILY_TARGET_HOURS = 8;
const PROJECT_COLORS = ['#EE7E23', '#57769B', '#4FAE32', '#C50000', '#19738C'];

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const planningRowLabel = (item: DashboardPlanningItem) => item.projectName ?? FORECAST_ASSIGNMENT_TYPE_LABELS[item.type];

function DailyProgressDonut({ percent }: { percent: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 100 ? 'var(--kora-success)' : 'var(--kora-lime)';

  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${Math.round(percent)}% completado`}>
      <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--kora-border-soft)" strokeWidth="7" />
      <circle
        cx="38"
        cy="38"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="42" textAnchor="middle" className={styles.donutLabel}>
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

interface MyActivityPanelProps {
  hours: DashboardHoursSummary | null;
  myActiveProjects: readonly DashboardMyActiveProject[];
  planning: DashboardMyPlanning | null;
  loading: boolean;
  weekStart: string | undefined;
  onWeekStartChange: (weekStart: string) => void;
}

/**
 * "Mi Panel de Actividad" — reemplaza, para `collaborator`, las tabs
 * Proyectos/Soporte del Dashboard (pensadas para quien gestiona una cartera
 * de proyectos) por el panel personal de la v1 (`ColaboradorDashboard`):
 * avance del día, horas de la semana, alertas de rechazo, proyectos activos,
 * planificación semanal y equipo.
 *
 * "Mi Equipo" difiere de la v1: ahí era una grilla día por día (Lun-Dom) con
 * los registros de horas aprobados de cada compañero; acá se arma con la
 * misma agregación semanal de `/forecast` (`ForecastCapacityService`) que ya
 * ve el líder, así que es un resumen semanal por proyecto — no por día — para
 * no exigirle a `collaborator` un permiso de forecast propio ni construir un
 * endpoint nuevo que exponga horas registradas de otras personas.
 */
export function MyActivityPanel({ hours, myActiveProjects, planning, loading, weekStart, onWeekStartChange }: MyActivityPanelProps) {
  const todayHours = hours?.todayHours ?? 0;
  const weekHours = hours?.weekHours ?? 0;
  const weekTargetHours = hours?.weekTargetHours ?? 40;
  const rejectedCount = hours?.rejectedCount ?? 0;
  const pctDiario = Math.min((todayHours / DAILY_TARGET_HOURS) * 100, 100);
  const pctSemanal = Math.min(Math.round((weekHours / weekTargetHours) * 100), 100);

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Mi Panel de Actividad</h2>

      <div className={styles.kpis}>
        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Progreso Diario</span>
          {loading ? (
            <span className={styles.loadingText}>…</span>
          ) : (
            <div className={styles.donutRow}>
              <DailyProgressDonut percent={pctDiario} />
              <div>
                <div className={styles.donutValue}>
                  {formatHours(todayHours)}/{formatHours(DAILY_TARGET_HOURS)}
                </div>
                <div className={styles.donutSub}>Horas hoy</div>
              </div>
            </div>
          )}
        </Card>

        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>HH registradas esta semana</span>
          {loading ? (
            <span className={styles.loadingText}>…</span>
          ) : (
            <>
              <span className={[styles.kpiValue, weekHours > weekTargetHours ? styles.kpiValueDanger : ''].join(' ')}>
                {formatHours(weekHours)}/{formatHours(weekTargetHours)} horas
              </span>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pctSemanal}%` }} />
              </div>
              <span className={styles.kpiSub}>{pctSemanal}% completado</span>
            </>
          )}
        </Card>

        <Card className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Atención Requerida</span>
          {loading ? (
            <span className={styles.loadingText}>…</span>
          ) : rejectedCount > 0 ? (
            <div className={styles.attentionAlert}>
              <AlertIcon size={16} />
              <span>
                {rejectedCount} {rejectedCount === 1 ? 'registro rechazado' : 'registros rechazados'}
              </span>
            </div>
          ) : (
            <div className={styles.attentionOk}>
              <CheckIcon size={20} />
              <span>Todo al día</span>
            </div>
          )}
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiLabelRow}>
            <span className={styles.kpiLabel}>Proyectos de la Semana</span>
            {!loading && <span className={styles.countBadge}>{myActiveProjects.length}</span>}
          </div>
          {loading ? (
            <span className={styles.loadingText}>…</span>
          ) : myActiveProjects.length === 0 ? (
            <span className={styles.empty}>Sin proyectos asignados</span>
          ) : (
            <ul className={styles.projectList}>
              {myActiveProjects.slice(0, 3).map((project, index) => (
                <li key={project.id} className={styles.projectItem}>
                  <span className={styles.projectDot} style={{ background: PROJECT_COLORS[index % PROJECT_COLORS.length] }} />
                  {project.name}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>Planificación Semanal</h3>
        {loading ? (
          <span className={styles.loadingText}>…</span>
        ) : !planning || planning.items.length === 0 ? (
          <div className={styles.sectionEmpty}>
            <CalendarIcon size={20} />
            <span>Sin registros en este período</span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Proyecto / Tipo</th>
                  <th className={styles.numCol}>HH semana</th>
                </tr>
              </thead>
              <tbody>
                {planning.items.map((item, index) => (
                  <tr key={`${item.type}-${item.projectName ?? index}`}>
                    <td>{planningRowLabel(item)}</td>
                    <td className={styles.numCol}>{formatHours(item.hours)} HH</td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Total semana</td>
                  <td className={styles.numCol}>{formatHours(planning.totalHours)} HH</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>Mi Equipo{planning?.teamName ? ` — ${planning.teamName}` : ''}</h3>
        {loading ? (
          <span className={styles.loadingText}>…</span>
        ) : !planning?.teamMembers || planning.teamMembers.length === 0 ? (
          <span className={styles.empty}>No hay miembros del equipo</span>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Proyectos esta semana</th>
                  <th className={styles.numCol}>HH semana</th>
                </tr>
              </thead>
              <tbody>
                {planning.teamMembers.map((member) => (
                  <tr key={member.fullName}>
                    <td>{member.fullName}</td>
                    <td>
                      {member.items.length === 0 ? (
                        <span className={styles.empty}>Sin asignaciones</span>
                      ) : (
                        member.items.map(planningRowLabel).join(', ')
                      )}
                    </td>
                    <td className={styles.numCol}>{formatHours(member.totalHours)} HH</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RecentHistoryCard weekStart={weekStart} onWeekStartChange={onWeekStartChange} />
    </div>
  );
}
