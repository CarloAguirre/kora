import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SupportProjectSummary } from '@kora/contracts';
import styles from './SupportProgressChart.module.css';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** "Historial de progreso" de `FichaProyectoSoporte` en la v1. */
export function SupportProgressChart({ summary }: { summary: SupportProjectSummary }) {
  const isMonthly = summary.planType === 'monthly';
  const data = summary.history.map((point, index) => ({ key: `${point.label}-${index}`, ...point }));
  // Con política de vencimiento nunca hay sobrantes: sin la serie, no queda un hueco vacío en cada mes.
  const hasSurplus = isMonthly && data.some((point) => (point.priorSurplusHours ?? 0) > 0);
  const usedLabel = isMonthly ? 'HH consumidas' : 'HH utilizadas';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Historial de progreso</p>
          <p className={styles.subtitle}>Horas Soporte contratadas, sobrantes anteriores y consumidas</p>
        </div>
        <div className={styles.legend}>
          {isMonthly && <LegendItem color="var(--kora-navy)" label="HH contratadas" />}
          {hasSurplus && <LegendItem color="var(--kora-blue-400)" label="HH sobrantes anteriores" />}
          <LegendItem color="var(--kora-lime-mid)" label={usedLabel} />
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={4} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--kora-blue-200)' }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatHours(value)} axisLine={false} tickLine={false} />
            <Tooltip content={<ProgressTooltip isMonthly={isMonthly} usedLabel={usedLabel} />} cursor={{ fill: 'var(--kora-surface-alt)' }} />
            {isMonthly && (
              <Bar dataKey="contractedHours" name="HH contratadas" fill="var(--kora-navy)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            )}
            {hasSurplus && (
              <Bar dataKey="priorSurplusHours" name="HH sobrantes anteriores" fill="var(--kora-blue-400)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            )}
            <Bar dataKey="usedHours" name={usedLabel} fill="var(--kora-lime-mid)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
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

function ProgressTooltip({
  active,
  payload,
  isMonthly,
  usedLabel,
}: {
  active?: boolean;
  payload?: readonly { payload: SupportProjectSummary['history'][number] }[];
  isMonthly: boolean;
  usedLabel: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const available = (point.contractedHours ?? 0) + (point.priorSurplusHours ?? 0);
  const ratio = isMonthly && available > 0 ? Math.round((point.usedHours / available) * 100) : null;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{point.label}</p>
      {isMonthly && <p>HH contratadas: {formatHours(point.contractedHours ?? 0)}</p>}
      {isMonthly && (point.priorSurplusHours ?? 0) > 0 && <p>HH sobrantes anteriores: {formatHours(point.priorSurplusHours ?? 0)}</p>}
      <p>
        {usedLabel}: {formatHours(point.usedHours)}
      </p>
      {ratio !== null && (
        <p className={ratio > 100 ? styles.tooltipDanger : styles.tooltipMuted}>
          {ratio}% de lo disponible ({formatHours(available)} hrs)
        </p>
      )}
    </div>
  );
}
