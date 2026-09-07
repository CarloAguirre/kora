import { GANTT_TASK_COLORS, GANTT_TASK_LABELS, GANTT_TASK_LEGEND_LABELS, type GanttModule, type ProjectGantt } from '../types';
import { StatusPill, type StatusPillTone } from './StatusPill';
import styles from './ProjectGanttChart.module.css';

const MODULE_STATUS_LABEL: Readonly<Record<GanttModule['status'], string>> = {
  finished: 'Finalizado',
  in_progress: 'En Proceso',
  upcoming: 'Próximo',
};

const MODULE_STATUS_TONE: Readonly<Record<GanttModule['status'], StatusPillTone>> = {
  finished: 'neutral',
  in_progress: 'info',
  upcoming: 'neutral',
};

/**
 * "Roadmap del proyecto" — Gantt semanal por módulo (Figma node 9203:2583).
 * Antes era una tarjeta "próximamente"; a pedido explícito se integró con
 * datos de ejemplo (`gantt` en `ClientProjectDetail`) en vez de una librería
 * de gráficos — es una cuadrícula CSS con barras posicionadas por porcentaje,
 * suficiente para esta vista y sin agregar una dependencia nueva.
 */
export function ProjectGanttChart({ gantt }: { gantt: ProjectGantt }) {
  return (
    <div className={styles.card} style={{ ['--today-percent' as string]: gantt.todayPercent }}>
      <div className={styles.monthsRow}>
        {gantt.months.map((month) => (
          <div key={month.label} className={styles.monthCell} style={{ flexGrow: month.weight }}>
            {month.label}
          </div>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.todayLine}>
          <span className={styles.todayTag}>HOY</span>
        </div>

        {gantt.modules.map((module) => (
          <div key={module.badge}>
            <div className={styles.moduleHeader}>
              <span className={styles.moduleBadge}>{module.badge}</span>
              <span className={styles.moduleName}>{module.name}</span>
              <span className={styles.moduleDivider} />
              <StatusPill tone={MODULE_STATUS_TONE[module.status]}>{MODULE_STATUS_LABEL[module.status]}</StatusPill>
            </div>

            {module.tasks.map((task) => (
              <div key={task.key} className={styles.taskRow}>
                <span className={styles.taskLabel}>{GANTT_TASK_LABELS[task.key]}</span>
                <div className={styles.taskTrack}>
                  {task.widthPercent > 0 && (
                    <div
                      className={[styles.taskBar, task.state === 'upcoming' ? styles.taskBarUpcoming : ''].join(' ')}
                      style={{
                        left: `${task.startPercent}%`,
                        width: `${task.widthPercent}%`,
                        background: task.state === 'upcoming' ? undefined : GANTT_TASK_COLORS[task.key],
                        borderColor: task.state === 'upcoming' ? '#93a0ac' : undefined,
                      }}
                    >
                      {task.stateLabel}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        {(Object.keys(GANTT_TASK_LABELS) as Array<keyof typeof GANTT_TASK_LABELS>).map((key) => (
          <span key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: GANTT_TASK_COLORS[key] }} />
            {GANTT_TASK_LEGEND_LABELS[key]}
          </span>
        ))}
        <span className={styles.legendNote}>┄ Estimado / próximo</span>
      </div>
    </div>
  );
}
