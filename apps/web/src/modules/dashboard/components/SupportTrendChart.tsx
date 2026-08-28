import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardSupportTrendPoint } from '@kora/contracts';
import styles from './SupportTrendChart.module.css';
import { Select } from '@/shared/components/ui/Select';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const PERIOD_OPTIONS = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '9', label: 'Últimos 9 meses' },
  { value: '12', label: 'Últimos 12 meses' },
];

/**
 * "Tendencia de uso vs horas contrato" — a diferencia de la v1 (datos
 * sintéticos con `Math.random()`, ver docs/DECISION-M7-DASHBOARD.md), los
 * puntos que llegan por `trend` son reales: horas de cada proyecto de
 * soporte prorrateadas por su rango de fechas.
 */
export function SupportTrendChart({ trend }: { trend: readonly DashboardSupportTrendPoint[] }) {
  const [months, setMonths] = useState(6);
  const visible = trend.slice(Math.max(0, trend.length - months));

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>Tendencia de uso vs horas contrato</span>
          <span className={styles.subtitle}>Comparativa de horas consumidas frente a límite contratado</span>
        </div>
        <Select
          className={styles.periodSelect}
          options={PERIOD_OPTIONS}
          value={String(months)}
          onChange={(event) => setMonths(Number(event.target.value))}
        />
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={visible as DashboardSupportTrendPoint[]} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => `${formatHours(Number(value))} hrs`} />
            <Line
              type="monotone"
              dataKey="usedHours"
              stroke="var(--kora-navy)"
              strokeWidth={2}
              dot={{ fill: 'var(--kora-lime)', stroke: 'var(--kora-navy)', strokeWidth: 2, r: 5 }}
              name="Horas Utilizadas"
            />
            <Line
              type="monotone"
              dataKey="contractedHours"
              stroke="var(--kora-blue-400)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              name="Límite Contratado"
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--kora-navy)' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
