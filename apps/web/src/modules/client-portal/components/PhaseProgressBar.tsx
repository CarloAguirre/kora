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
 * de 5 pasos (Figma node 9203:2329). Los colores por paso dependen del
 * ESTADO DE LA FASE, no son verdes para "hecho" en general:
 * - fase `finished`: los 5 pasos en gris-azulado (#93a5b8), NUNCA verde.
 * - fase `upcoming`: los 5 pasos en gris claro (#f1f4f7), tarjeta punteada.
 * - fase `in_progress`: pasos anteriores al actual en gris-azulado, el actual
 *   en verde (#8bc53f), los siguientes en gris claro — y solo esta fase
 *   muestra la línea roja "HOY".
 */
export function PhaseProgressBar({ phase }: { phase: ClientRoadmapPhase }) {
  const currentIndex = phase.currentStep ? ROADMAP_STEPS.indexOf(phase.currentStep) : -1;

  return (
    <div className={[styles.phase, phase.status === 'upcoming' ? styles.phaseUpcoming : ''].join(' ')}>
      <div className={styles.phaseHeader}>
        <StatusPill tone={STATUS_TONE[phase.status]}>{STATUS_LABEL[phase.status]}</StatusPill>
        <span className={styles.phaseName}>{phase.name}</span>
        <span className={styles.phaseDates}>
          Inicio: {phase.startDate} - Fin: {phase.endDate}
        </span>
      </div>

      <div className={styles.months}>
        {phase.months.map((month, index) => (
          <span key={index}>{month}</span>
        ))}
      </div>

      <div className={styles.steps}>
        {phase.todayMarkerPercent != null && (
          <div className={styles.todayLine} style={{ left: `${phase.todayMarkerPercent}%` }}>
            <span className={styles.todayTag}>HOY</span>
          </div>
        )}
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
