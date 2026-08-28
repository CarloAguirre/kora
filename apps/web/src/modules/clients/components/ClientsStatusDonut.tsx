import styles from './ClientsStatusDonut.module.css';

interface ClientsStatusDonutProps {
  activeCount: number;
  inactiveCount: number;
  loading: boolean;
}

const SIZE = 160;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** "Cantidad de Clientes" — anillo Activos/Inactivos, igual disposición que la card homónima de la v1. */
export function ClientsStatusDonut({ activeCount, inactiveCount, loading }: ClientsStatusDonutProps) {
  const total = activeCount + inactiveCount;
  const activeRatio = total === 0 ? 0 : activeCount / total;
  const activeLength = CIRCUMFERENCE * activeRatio;

  return (
    <div className={styles.card}>
      <span className={styles.title}>Cantidad de Clientes</span>

      <div className={styles.body}>
        <div className={styles.ringWrapper}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.ring} aria-hidden="true">
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--kora-surface-disabled)"
              strokeWidth={STROKE}
            />
            {total > 0 && (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--kora-success)"
                strokeWidth={STROKE}
                strokeDasharray={`${activeLength} ${CIRCUMFERENCE - activeLength}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            )}
          </svg>
          <div className={styles.center}>
            <span className={styles.centerValue}>{loading ? '—' : activeCount}</span>
            <span className={styles.centerLabel}>activos</span>
          </div>
        </div>

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotActive}`} />
            Activos: {loading ? '—' : activeCount}
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotInactive}`} />
            Inactivos: {loading ? '—' : inactiveCount}
          </div>
        </div>
      </div>

      <p className={styles.footnote}>De un total de {loading ? '—' : total}</p>
    </div>
  );
}
