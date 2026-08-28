import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SupportProjectSummary } from '@kora/contracts';
import styles from './SupportProgressChart.module.css';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** "Historial de progreso" de `FichaProyectoSoporte` en la v1. */
export function SupportProgressChart({ summary }: { summary: SupportProjectSummary }) {
  const isMonthly = summary.planType === 'monthly';
  const data = summary.history.map((point, index) => ({ key: `${point.label}-${index}`, ...point }));

  return (
    <div className={styles.card}>
      <div>
        <p className={styles.title}>Historial de progreso</p>
        <p className={styles.subtitle}>Horas Soporte contratadas, sobrantes anteriores y consumidas</p>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: unknown) => `${formatHours(Number(value))} hrs`} />
            {isMonthly && (
              <>
                <Bar dataKey="contractedHours" name="HH contratadas" fill="var(--kora-navy)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="priorSurplusHours" name="HH sobrantes anteriores" fill="var(--kora-blue-400)" radius={[4, 4, 0, 0]} />
              </>
            )}
            <Bar dataKey="usedHours" name={isMonthly ? 'HH consumidas' : 'HH utilizadas'} fill="var(--kora-lime-mid)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.legend}>
        {isMonthly && (
          <>
            <LegendItem color="var(--kora-navy)" label="HH contratadas" />
            <LegendItem color="var(--kora-blue-400)" label="HH sobrantes anteriores" />
          </>
        )}
        <LegendItem color="var(--kora-lime-mid)" label={isMonthly ? 'HH consumidas' : 'HH utilizadas'} />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
