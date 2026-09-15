import { PROJECT_PHASES, PROJECT_PHASE_LABELS, type ProjectPhase } from '@kora/contracts';
import styles from './ProjectTimeline.module.css';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Réplica de la generación de etiquetas de mes de `LiderProyectoFicha` (v1): un mes por
 * cada mes calendario entre inicio y fin, recortado a 8 etiquetas como máximo. */
function getMonthLabels(startDate: string | null, endDate: string | null): string[] {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

  let labels: string[] = [];
  if (start && end && end >= start) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      labels.push(`${MONTHS_ES[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  if (labels.length === 0) labels = ['—'];
  if (labels.length > 8) {
    const step = Math.ceil(labels.length / 8);
    labels = labels.filter((_, i) => i % step === 0 || i === labels.length - 1);
  }
  return labels;
}

interface ProjectTimelineProps {
  phase: ProjectPhase | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Posición de "HOY" en la barra: porcentaje de días transcurridos entre
 * inicio y fin — no el centro de la fase actual. La fase es una categoría
 * elegida a mano y puede ir adelantada o atrasada respecto al calendario, así
 * que anclar el marcador a ella hacía que "HOY" no coincidiera con la fecha
 * real (p. ej. a mitad de camino en fechas pero recién en la 2ª de 5 fases).
 */
function getTodayPercent(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (end <= start) return null;

  const ratio = (Date.now() - start) / (end - start);
  return Math.min(100, Math.max(0, ratio * 100));
}

/** Réplica de la barra de fases + fila de meses de `LiderProyectoFicha` (v1). */
export function ProjectTimeline({ phase, startDate, endDate }: ProjectTimelineProps) {
  const currentIndex = phase ? PROJECT_PHASES.indexOf(phase) : -1;
  const monthLabels = getMonthLabels(startDate, endDate);
  const todayPercent = getTodayPercent(startDate, endDate);

  return (
    <div className={styles.timeline}>
      <div className={styles.track}>
        {PROJECT_PHASES.map((step, index) => {
          const state = index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future';
          const className = [
            styles.segment,
            state === 'past' ? styles.segmentPast : state === 'future' ? styles.segmentFuture : styles[`segmentCurrent_${step}`],
          ].join(' ');

          return (
            <div key={step} className={className}>
              {PROJECT_PHASE_LABELS[step]}
            </div>
          );
        })}

        {todayPercent !== null && (
          <span className={styles.today} style={{ left: `${todayPercent}%` }}>
            <span className={styles.todayPill}>HOY</span>
            <span className={styles.todayLine} />
          </span>
        )}
      </div>

      <div className={styles.monthLabels}>
        {monthLabels.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
    </div>
  );
}
