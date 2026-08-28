import { TICKET_PRIORITY_LABELS, type TicketPriority } from '@kora/contracts';
import styles from './TicketPriorityBadge.module.css';

/** Colores exactos de `CRITICIDAD_STYLES` en `Soporte/constants.ts`. */
export function TicketPriorityBadge({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <span className={styles.empty}>—</span>;
  return <span className={[styles.badge, styles[priority]].join(' ')}>{TICKET_PRIORITY_LABELS[priority]}</span>;
}
