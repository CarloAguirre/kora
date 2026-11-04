import type { SupportProjectSummary } from '@kora/contracts';
import { AlertIcon } from '@/shared/components/icons/Icons';
import styles from './SupportHoursStatus.module.css';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Desde este consumo la barra pasa a advertencia (naranjo); sobre el 100%, a peligro (rojo). */
const WARNING_RATIO = 0.9;

interface Stat {
  readonly label: string;
  readonly value: number;
}

/**
 * Bloque "Estado del proyecto" de la ficha de soporte. Reemplaza el anillo de la v1, que ponía la
 * capacidad en el centro y dejaba el consumo en una leyenda con colores que no estaban en el gráfico.
 * Ahora la cifra principal es lo que queda por usar, la barra muestra cuánto se consumió contra el
 * tope y debajo va el desglose: en mensual, las HH del plan más el saldo acumulado de meses anteriores.
 */
export function SupportHoursStatus({ summary }: { summary: SupportProjectSummary }) {
  if (summary.planType === 'on_demand') {
    return (
      <div className={styles.wrapper}>
        <Headline value={summary.usedHours} label="utilizadas en el contrato" />
        <p className={styles.note}>A demanda: sin tope de horas.</p>
      </div>
    );
  }

  if (summary.planType === 'bundle') {
    const capacity = summary.contractedHours;
    return (
      <HoursBudget
        capacity={capacity}
        used={summary.usedHours}
        remainingLabel="restantes de la bolsa"
        stats={[
          { label: 'Bolsa contratada', value: capacity },
          { label: 'Utilizadas', value: summary.usedHours },
        ]}
      />
    );
  }

  const period = summary.currentPeriod;
  if (!period) {
    return (
      <div className={styles.wrapper}>
        <Headline value={summary.usedHours} label="utilizadas en el contrato" />
        <p className={styles.note}>Sin período mensual vigente hoy.</p>
      </div>
    );
  }

  return (
    <HoursBudget
      capacity={period.capacityHours}
      used={period.usedHours}
      remainingLabel="restantes este mes"
      stats={[
        { label: 'Plan del mes', value: period.planHours },
        { label: 'Acumuladas de meses anteriores', value: period.priorSurplusHours },
        { label: 'Utilizadas este mes', value: period.usedHours },
        { label: 'Utilizadas en todo el contrato', value: summary.usedHours },
      ]}
    />
  );
}

function HoursBudget({
  capacity,
  used,
  remainingLabel,
  stats,
}: {
  capacity: number;
  used: number;
  remainingLabel: string;
  stats: readonly Stat[];
}) {
  const remaining = Math.max(capacity - used, 0);
  const overage = Math.max(used - capacity, 0);
  const ratio = capacity > 0 ? used / capacity : used > 0 ? Infinity : 0;
  const tone = ratio > 1 ? styles.fillDanger : ratio >= WARNING_RATIO ? styles.fillWarning : styles.fillOk;
  const fillPercent = Math.min(ratio, 1) * 100;
  const summaryText = `${formatHours(used)} de ${formatHours(capacity)} h utilizadas`;

  return (
    <div className={styles.wrapper}>
      <Headline value={remaining} label={remainingLabel} />

      <div className={styles.meterBlock}>
        <div
          className={styles.track}
          role="meter"
          aria-label="Consumo de horas"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={Math.min(used, capacity)}
          aria-valuetext={summaryText}
          title={summaryText}
        >
          {used > 0 && <div className={`${styles.fill} ${tone}`} style={{ width: `${fillPercent}%` }} />}
        </div>
        <div className={styles.scale}>
          <span>{formatHours(used)} h utilizadas</span>
          <span>de {formatHours(capacity)} h disponibles</span>
        </div>
      </div>

      {overage > 0 && (
        <p className={styles.overage}>
          <AlertIcon size={14} aria-hidden="true" />
          Excedido en {formatHours(overage)} h
        </p>
      )}

      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt>{stat.label}</dt>
            <dd>{formatHours(stat.value)} h</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Headline({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.headline}>
      <span className={styles.headlineValue}>{formatHours(value)} h</span>
      <span className={styles.headlineLabel}>{label}</span>
    </div>
  );
}
