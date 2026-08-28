import type { SupportProjectSummary } from '@kora/contracts';
import styles from './SupportHoursDonut.module.css';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

const RADIUS = 42.4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anillo "Estado del proyecto" de `FichaProyectoSoporte` en la v1: muestra la
 * capacidad total en el centro (no lo consumido), con una leyenda que sí
 * desglosa consumo — igual criterio que la v1, aunque a primera vista pueda
 * parecer invertido.
 */
export function SupportHoursDonut({ summary }: { summary: SupportProjectSummary }) {
  const isMonthly = summary.planType === 'monthly';
  const isDemand = summary.planType === 'on_demand';

  const totalHH = isMonthly
    ? (summary.currentPeriod?.capacityHours ?? summary.contractedHours)
    : isDemand
      ? summary.usedHours
      : summary.usedHours + (summary.availableHours ?? 0);

  const usedHH = isMonthly ? (summary.currentPeriod?.usedHours ?? 0) : summary.usedHours;
  const ratio = totalHH > 0 ? Math.min(usedHH / totalHH, 1) : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.ring}>
        <svg width="106" height="106" viewBox="0 0 106 106">
          <circle cx="53" cy="53" r={RADIUS} fill="none" stroke="var(--kora-surface-disabled)" strokeWidth="10.6" />
          {totalHH > 0 && (
            <circle
              cx="53"
              cy="53"
              r={RADIUS}
              fill="none"
              stroke="var(--kora-lime-mid)"
              strokeWidth="10.6"
              strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * 0.25}
              transform="rotate(-90 53 53)"
            />
          )}
        </svg>
        <div className={styles.ringLabel}>
          <span className={styles.ringValue}>{formatHours(totalHH)}</span>
          <span className={styles.ringUnit}>HH</span>
        </div>
      </div>

      {isMonthly ? (
        <div className={styles.legendGrid}>
          <LegendItem color="var(--kora-lime-mid)" label="HH Utilizadas período actual" value={summary.currentPeriod?.usedHours ?? 0} />
          <LegendItem color="var(--kora-navy)" label="HH Utilizadas total" value={summary.usedHours} />
          <LegendItem color="var(--kora-blue-400)" label="HH Restantes" value={summary.currentPeriod?.remainingHours ?? 0} />
          <LegendItem color="var(--kora-text-muted)" label="HH Disponibles" value={summary.availableHours ?? 0} />
        </div>
      ) : (
        <div className={styles.legendRow}>
          <LegendItem color="var(--kora-lime-mid)" label="HH Utilizadas" value={summary.usedHours} />
          {!isDemand && <LegendItem color="var(--kora-text-muted)" label="HH Disponibles" value={summary.availableHours ?? 0} />}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} aria-hidden="true" />
      <span className={styles.legendText}>
        {label}: {formatHours(value)}
      </span>
    </div>
  );
}
