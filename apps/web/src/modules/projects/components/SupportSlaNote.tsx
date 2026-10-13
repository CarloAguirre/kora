import { TICKET_PRIORITIES, type TicketPriority } from '@kora/contracts';
import { InfoIcon } from '@/shared/components/icons/Icons';
import { TicketPriorityBadge } from '@/modules/tickets/components/TicketPriorityBadge';
import styles from './SupportSlaNote.module.css';

/** SLA fijo de los contratos de soporte (horas de respuesta por criticidad del ticket): no es editable. */
export const SUPPORT_SLA_TARGET_HOURS: Readonly<Record<TicketPriority, number>> = {
  critical: 1,
  high: 2,
  medium: 12,
  low: 24,
};

/**
 * Tiempos de respuesta (SLA) de soporte como tarjetas de solo lectura, una por
 * criticidad. Reemplaza a los campos de SLA que antes se editaban: se muestran
 * solo como referencia para que se sepa a qué criticidad corresponde cada tiempo.
 */
export function SupportSlaNote() {
  return (
    <div className={styles.wrapper}>
      <ul className={styles.grid}>
        {TICKET_PRIORITIES.map((priority) => {
          const hours = SUPPORT_SLA_TARGET_HOURS[priority];
          return (
            <li key={priority} className={[styles.tile, styles[priority]].join(' ')}>
              <TicketPriorityBadge priority={priority} />
              <span className={styles.value}>
                {hours} {hours === 1 ? 'hora' : 'horas'}
              </span>
              <span className={styles.caption}>Tiempo máximo de respuesta</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.hint}>
        <InfoIcon size={14} />
        Valores fijos para todos los contratos de soporte; no se pueden editar.
      </p>
    </div>
  );
}
