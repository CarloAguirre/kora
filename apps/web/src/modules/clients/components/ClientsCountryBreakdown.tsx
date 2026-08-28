import type { ClientsCountryBreakdown as CountryBreakdownItem } from '@kora/contracts';
import styles from './ClientsCountryBreakdown.module.css';

interface ClientsCountryBreakdownProps {
  items: readonly CountryBreakdownItem[];
  loading: boolean;
}

const COLORS = ['var(--kora-navy)', 'var(--kora-blue-600)', 'var(--kora-blue-400)', 'var(--kora-blue-200)'];

/** "Total de clientes" — desglose por país, igual disposición que la card homónima de la v1. */
export function ClientsCountryBreakdown({ items, loading }: ClientsCountryBreakdownProps) {
  const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Total de clientes</span>
        <span className={styles.subtitle}>Por país</span>
      </div>

      <div className={styles.list}>
        {loading ? (
          <span className={styles.empty}>Cargando…</span>
        ) : items.length === 0 ? (
          <span className={styles.empty}>No hay datos de clientes</span>
        ) : (
          items.map((item, index) => (
            <div key={item.country} className={styles.item}>
              <span className={styles.itemName}>{item.country}</span>
              <div className={styles.track}>
                <div
                  className={styles.fill}
                  style={{
                    width: maxCount === 0 ? 0 : `${(item.count / maxCount) * 100}%`,
                    background: COLORS[Math.min(index, COLORS.length - 1)],
                  }}
                />
              </div>
              <span className={styles.itemCount}>{item.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
