import type { ReactNode } from 'react';
import styles from './HhBreakdownTooltip.module.css';
import type { TicketHhBreakdownEntry } from '../lib/ticket-hh-breakdown';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * "HH registradas por persona" al pasar el mouse — réplica de
 * `ApprovedTicketHHTooltip` (v1). Puro CSS (`:hover`/`:focus-within`): no hay
 * overlay ni estado, así que no compite con el resto de la UI por z-index.
 */
export function HhBreakdownTooltip({ breakdown, children }: { breakdown: readonly TicketHhBreakdownEntry[]; children: ReactNode }) {
  if (breakdown.length === 0) return <>{children}</>;

  return (
    <span className={styles.wrapper} tabIndex={0} aria-label="HH utilizadas. Ver desglose por persona">
      {children}
      <span className={styles.tooltip} role="tooltip">
        <strong className={styles.title}>HH registradas por persona</strong>
        {breakdown.map((person) => (
          <span key={person.userId} className={styles.row}>
            <span>{person.fullName}</span>
            <span>{formatHours(person.hours)}h</span>
          </span>
        ))}
      </span>
    </span>
  );
}
