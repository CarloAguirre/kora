import { HOUR_ENTRY_STATUS_LABELS, type HourEntryStatus } from '@kora/contracts';
import styles from './HourEntryStatusBadge.module.css';

/**
 * Estado de un registro de horas. Colores propios, distintos de `Badge`
 * genérico: la v1 usa esta paleta específica para pendiente/aprobado/rechazado
 * (`getEstadoStyle` en `ColaboradorDashboard`), separada de la que usan los
 * badges de estado de cliente/usuario.
 */
export function HourEntryStatusBadge({ status }: { status: HourEntryStatus }) {
  return <span className={[styles.badge, styles[status]].join(' ')}>{HOUR_ENTRY_STATUS_LABELS[status]}</span>;
}
