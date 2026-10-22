import { ROADMAP_STEPS, ROADMAP_STEP_LABELS, type ClientRoadmapPhase } from '../types';
import { StatusPill, type StatusPillTone } from './StatusPill';
import styles from './PhaseProgressBar.module.css';

const STATUS_LABEL: Readonly<Record<ClientRoadmapPhase['status'], string>> = {
  finished: 'Finalizado',
  in_progress: 'En proceso',
  upcoming: 'Próximo',
};

/** "En proceso" es lavanda/morado en el Figma, no ámbar — un tono distinto del
 *  que usan los hitos ("Esperando aprobación", que sí es ámbar/`warning`). */
const STATUS_TONE: Readonly<Record<ClientRoadmapPhase['status'], StatusPillTone>> = {
  finished: 'success',
  in_progress: 'info',
  upcoming: 'neutral',
};

/**
 * Una fila de "Hoja de ruta": nombre de fase + eje de meses + su mini-pipeline
 * de 5 pasos (Figma node 9663:24531, variante "Kora · Proyectos y Soporte 2").
 * Los colores por paso dependen del ESTADO DE LA FASE:
 * - fase `finished`: los 5 pasos en verde (#2e9e52) — antes eran gris-azulado,
 *   nunca verde; el Figma actualizado los pinta verdes.
 * - fase `upcoming`: los 5 pasos en gris claro (#f1f4f7), tarjeta punteada.
 * - fase `in_progress`: pasos anteriores al actual en verde (#2e9e52), el
 *   actual en ámbar (#ffae00) — antes el actual iba en verde —, los
 *   siguientes en gris claro. La línea roja de esta fase ya NO lleva la
 *   etiqueta "HOY": en el Figma esa etiqueta queda recortada fuera del área
 *   visible (`overflow: hidden` del contenedor), y el texto de apoyo la
 *   describe como el avance ESPERADO a hoy, no como "hoy" en sí.
 */
export function PhaseProgressBar({
  phase,
  embedded = false,
}: {
  phase: ClientRoadmapPhase;
  /** Dentro de una fase del Roadmap, que ya muestra nombre y estado: sin tarjeta propia, con un título "Hoja de ruta". */
  embedded?: boolean;
}) {
  const currentIndex = phase.currentStep ? ROADMAP_STEPS.indexOf(phase.currentStep) : -1;

  return (
    <div
      className={
        embedded ? styles.embedded : [styles.phase, phase.status === 'upcoming' ? styles.phaseUpcoming : ''].join(' ')
      }
    >
      {embedded ? (
        <span className={styles.embeddedLabel}>Hoja de ruta</span>
      ) : (
        <div className={styles.phaseHeader}>
          <StatusPill tone={STATUS_TONE[phase.status]}>{STATUS_LABEL[phase.status]}</StatusPill>
          <span className={styles.phaseName}>{phase.name}</span>
          <span className={styles.phaseDates}>
            Inicio: {phase.startDate} - Fin: {phase.endDate}
          </span>
        </div>
      )}

      <div className={styles.months}>
        {phase.months.map((month, index) => (
          <span key={index}>{month}</span>
        ))}
      </div>

      <div className={styles.steps}>
        {phase.expectedProgressPercent != null && <div className={styles.expectedProgressLine} style={{ left: `${phase.expectedProgressPercent}%` }} />}
        {ROADMAP_STEPS.map((step, index) => {
          const style: 'past' | 'current' | 'future' =
            phase.status === 'finished' ? 'past' : phase.status === 'upcoming' ? 'future' : index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future';

          return (
            <div key={step} className={[styles.step, styles[style]].join(' ')}>
              {ROADMAP_STEP_LABELS[step]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
