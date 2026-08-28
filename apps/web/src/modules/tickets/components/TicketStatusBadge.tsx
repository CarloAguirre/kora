import { TICKET_STATUS_LABELS, type TicketStatus } from '@kora/contracts';
import styles from './TicketStatusBadge.module.css';

/** Colores propios del tablero de tickets (`Soporte/index.tsx`) — "En Pruebas" es lavanda, no uno de los tonos genéricos. */
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <span className={[styles.badge, styles[status]].join(' ')}>{TICKET_STATUS_LABELS[status]}</span>;
}
