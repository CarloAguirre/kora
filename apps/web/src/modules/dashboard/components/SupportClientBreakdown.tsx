import { Link } from 'react-router-dom';
import type { DashboardSupportClient } from '@kora/contracts';
import styles from './SupportClientBreakdown.module.css';
import { Button } from '@/shared/components/ui/Button';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const COLORS = ['var(--kora-navy)', 'var(--kora-blue-600)', 'var(--kora-blue-400)', 'var(--kora-blue-200)', 'var(--kora-lime-mid)'];

/** "Desglose por cliente" — Top 5 consumidores de Soporte, igual que en la v1. */
export function SupportClientBreakdown({ clients }: { clients: readonly DashboardSupportClient[] }) {
  const { can } = usePermissions();

  return (
    <div className={styles.card}>
      <div>
        <span className={styles.title}>Desglose por cliente</span>
        <p className={styles.subtitle}>Top 5 consumidores de Soporte</p>
      </div>

      <div className={styles.list}>
        {clients.length === 0 ? (
          <span className={styles.empty}>No hay datos de clientes</span>
        ) : (
          clients.map((client, index) => (
            <div key={client.name} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.itemName}>{client.name}</span>
                <span className={styles.itemPercent}>{client.percent}%</span>
              </div>
              <div className={styles.itemDetail}>
                {formatHours(client.usedHours)}/{formatHours(client.soldHours)} h
              </div>
              <div className={styles.track}>
                <div
                  className={styles.fill}
                  style={{ width: `${Math.min(client.percent, 100)}%`, background: COLORS[index % COLORS.length] }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {can('clients:read') && (
        <Link to="/clientes" className={styles.footerLink}>
          <Button variant="tertiary">Ver todos los clientes</Button>
        </Link>
      )}
    </div>
  );
}
