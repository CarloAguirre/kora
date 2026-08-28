import type { ProjectPriority } from '@kora/contracts';
import { PROJECT_PRIORITY_LABELS } from '@kora/contracts';
import styles from './PriorityIndicator.module.css';

/**
 * Prioridad como punto de color + texto, igual que la columna "Prioridad" de
 * la v1 (`PRIORITY_COLOR` en `constants.ts`) — no es un `Badge`, es un
 * indicador de texto plano.
 */
const COLOR_BY_PRIORITY: Readonly<Record<ProjectPriority, string>> = {
  high: '#7C3AED',
  medium: '#2E6DE0',
  low: '#7797BD',
};

export function PriorityIndicator({ priority }: { priority: ProjectPriority | null }) {
  if (!priority) return <span className={styles.empty}>—</span>;
  return (
    <span className={styles.indicator}>
      <span className={styles.dot} style={{ background: COLOR_BY_PRIORITY[priority] }} aria-hidden="true" />
      {PROJECT_PRIORITY_LABELS[priority]}
    </span>
  );
}
