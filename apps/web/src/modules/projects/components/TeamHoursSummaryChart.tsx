import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './TeamHoursSummaryChart.module.css';
import { Card } from '@/shared/components/ui/Card';
import { FolderOpenIcon } from '@/shared/components/icons/Icons';

export interface TeamHoursSummary {
  teamId: string;
  teamName: string;
  assignedHours: number;
  consumedHours: number;
}

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Franja "Resumen de HH por equipo" — réplica del bloque `fpd-chart-*` de
 * `LiderProyectoFicha` (v1): gráfico de barras (Asignadas + Desviadas apiladas,
 * Utilizadas aparte) por equipo, con totalizadores y % de avance a la derecha.
 */
export function TeamHoursSummaryChart({ teams }: { teams: readonly TeamHoursSummary[] }) {
  const chartData = useMemo(
    () =>
      teams.map((team) => ({
        equipo: team.teamName,
        asignadas: team.assignedHours,
        utilizadas: team.consumedHours,
        desviadas: Math.max(0, team.consumedHours - team.assignedHours),
      })),
    [teams],
  );

  const totals = useMemo(() => {
    const totalAsignadas = teams.reduce((acc, t) => acc + t.assignedHours, 0);
    const totalUtilizadas = teams.reduce((acc, t) => acc + t.consumedHours, 0);
    const totalDesviadas = teams.reduce((acc, t) => acc + Math.max(0, t.consumedHours - t.assignedHours), 0);
    const totalRestantes = Math.max(0, totalAsignadas - totalUtilizadas);
    const avancePct = totalAsignadas > 0 ? Math.round((totalUtilizadas / totalAsignadas) * 100) : 0;
    return { totalAsignadas, totalUtilizadas, totalDesviadas, totalRestantes, avancePct };
  }, [teams]);

  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>Resumen de HH por equipo</h2>
        <p className={styles.subtitle}>HH Asignadas vs HH Utilizadas</p>
      </div>

      <div className={styles.body}>
        <div className={styles.chartArea}>
          {teams.length === 0 ? (
            <div className={styles.empty}>
              <FolderOpenIcon size={28} />
              <span>Los datos estarán disponibles cuando el proyecto tenga equipos asignados.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" vertical={false} />
                <XAxis dataKey="equipo" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="asignadas" stackId="plan" fill="var(--kora-lime)" />
                <Bar dataKey="desviadas" stackId="plan" fill="var(--kora-danger)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="utilizadas" fill="var(--kora-navy)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className={styles.legend}>
            <LegendItem color="var(--kora-lime)" label="HH Asignadas" />
            <LegendItem color="var(--kora-navy)" label="HH Utilizadas" />
            <LegendItem color="var(--kora-danger)" label="HH desviadas" />
          </div>
        </div>

        <div className={styles.summary}>
          <p className={styles.summaryTitle}>Totalizadores</p>
          <SummaryItem label="HH asignadas" value={totals.totalAsignadas} />
          <SummaryItem label="HH Utilizadas" value={totals.totalUtilizadas} />
          <SummaryItem label="HH restantes" value={totals.totalRestantes} danger={totals.totalDesviadas > 0} />

          <div className={styles.avanceBox}>
            <span className={styles.avanceLabel}>Avance equipos</span>
            <span className={styles.avanceValue}>{totals.avancePct}%</span>
          </div>
        </div>
      </div>
    </Card>
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

function SummaryItem({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={[styles.summaryValue, danger ? styles.danger : ''].filter(Boolean).join(' ')}>{formatHours(value)} hrs</span>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: Record<string, unknown> }[] }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as { equipo: string; asignadas: number; utilizadas: number; desviadas: number };
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{data.equipo}</p>
      <p>HH Asignadas: {formatHours(data.asignadas)}</p>
      <p>HH Utilizadas: {formatHours(data.utilizadas)}</p>
      {data.desviadas > 0 && <p className={styles.tooltipDanger}>HH Desviadas: {formatHours(data.desviadas)}</p>}
    </div>
  );
}
