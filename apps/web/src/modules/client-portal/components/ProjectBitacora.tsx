import styles from './ProjectBitacora.module.css';
import type { ClientBitacoraEntry, ClientBitacoraEntryKind } from '../types';

/**
 * Glifos tal cual el Figma (node 9663:24685, variante "Kora · Proyectos y
 * Soporte 2") — son texto plano en el diseño, no íconos Lucide, así que se
 * reproducen igual en vez de forzar un ícono que no calce.
 */
const KIND_GLYPH: Readonly<Record<ClientBitacoraEntryKind, string>> = {
  completed: '✓',
  marked: '→',
  attention: '⚑',
  milestone: '★',
  pending: '◆',
};

const KIND_ICON_CLASS: Readonly<Record<ClientBitacoraEntryKind, string>> = {
  completed: 'iconCompleted',
  marked: 'iconMarked',
  attention: 'iconAttention',
  milestone: 'iconMilestone',
  pending: 'iconPending',
};

/**
 * "Bitácora" — reemplaza "Hitos y aprobaciones" + "Puntos de atención e
 * incidentes" (Figma node 9663:24685): un feed cronológico único, cada
 * entrada con su propia etiqueta de fase en vez de vivir bajo un solo
 * `milestonesCaption` de la fase activa.
 */
export function ProjectBitacora({ entries, onSeeMore }: { entries: readonly ClientBitacoraEntry[]; onSeeMore: () => void }) {
  return (
    <div className={styles.card}>
      {entries.map((entry) => (
        <BitacoraEntryRow key={entry.id} entry={entry} />
      ))}
      <button type="button" className={styles.seeMore} onClick={onSeeMore}>
        Ver más
      </button>
    </div>
  );
}

/** Una fila de bitácora sola, sin la tarjeta ni el botón "Ver más" — la
 *  reutiliza `PhaseRoadmap` para el mini-listado "Registros de bitácora
 *  relacionados" dentro de cada fase (Figma: mismas filas, sin envoltorio de
 *  tarjeta propia ahí). */
export function BitacoraEntryRow({ entry }: { entry: ClientBitacoraEntry }) {
  return (
    <div className={styles.row}>
      <span className={[styles.icon, styles[KIND_ICON_CLASS[entry.kind]]].join(' ')}>{KIND_GLYPH[entry.kind]}</span>
      <div className={styles.body}>
        <div className={styles.headRow}>
          <span className={styles.title}>{entry.title}</span>
          <span className={[styles.statusBadge, styles[`tone_${entry.statusTone}`]].join(' ')}>{entry.statusLabel}</span>
        </div>
        <p className={styles.meta}>
          Registro por: {entry.registeredByName} - {entry.registeredAt}
          {entry.phaseTag && <> · {entry.phaseTag}</>}
        </p>
        <p className={styles.description}>{entry.description}</p>
        {entry.secondaryNote && <p className={[styles.secondaryNote, styles[`tone_${entry.statusTone}`]].join(' ')}>{entry.secondaryNote}</p>}
      </div>
    </div>
  );
}
