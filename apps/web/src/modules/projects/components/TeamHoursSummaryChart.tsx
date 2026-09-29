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
 * Alto mínimo (px) de una barra con valor > 0. Contra una escala de miles de
 * HH, unas pocas horas miden menos de 2px y el borde blanco de 2px las tapa
 * entera — el gráfico parecía no registrar el consumo. Un valor 0 sigue sin
 * dibujarse, para no inventar barras.
 */
const MIN_VISIBLE_BAR_PX = 6;
const minVisibleBar = (value: number | undefined | null) => ((value ?? 0) > 0 ? MIN_VISIBLE_BAR_PX : 0);

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
        // Total real usado — para el tooltip. La barra apilada usa `utilizadasDentro`
        // + `desviadas` en su lugar, para no contar dos veces el exceso.
        utilizadas: team.consumedHours,
        utilizadasDentro: Math.min(team.assignedHours, team.consumedHours),
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
                {/* Grilla y ejes recesivos a propósito — cargan el ojo los datos, no los ejes. */}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" vertical={false} />
                <XAxis
                  dataKey="equipo"
                  tick={{ fontSize: 12, fill: 'var(--kora-text-muted)' }}
                  axisLine={{ stroke: 'var(--kora-surface-disabled)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--kora-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Horas', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: 'var(--kora-text-muted)' } }}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--kora-surface-muted)' }} />
                <Bar
                  dataKey="asignadas"
                  fill="var(--kora-lime)"
                  stroke="var(--kora-surface)"
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                  minPointSize={minVisibleBar}
                  activeBar={{ fillOpacity: 0.85 }}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                {/* Lo "desviado" es exceso de USO sobre lo planificado — se apila sobre la barra de utilizadas (no sobre la de asignadas), para que se lea como "usamos esto, y esto de más". `utilizadasDentro` (no el total) evita contar el exceso dos veces. */}
                <Bar
                  dataKey="utilizadasDentro"
                  stackId="uso"
                  fill="var(--kora-navy)"
                  stroke="var(--kora-surface)"
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                  minPointSize={minVisibleBar}
                  activeBar={{ fillOpacity: 0.85 }}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="desviadas"
                  stackId="uso"
                  fill="var(--kora-danger)"
                  stroke="var(--kora-surface)"
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                  minPointSize={minVisibleBar}
                  activeBar={{ fillOpacity: 0.85 }}
                  animationDuration={700}
                  animationEasing="ease-out"
                  animationBegin={150}
                />
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
            {/* Con consumo real pero < 0,5% el redondeo daría "0%", que se lee como "no ha partido". */}
            <span className={styles.avanceValue}>{totals.avancePct === 0 && totals.totalUtilizadas > 0 ? '<1' : totals.avancePct}%</span>
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
      <div className={styles.tooltipHead}>
        <span className={styles.tooltipDot} aria-hidden="true" />
        <span className={styles.tooltipTitle}>{data.equipo}</span>
      </div>
      {/* El texto siempre en tinta neutra — el color de la serie ya lo lleva el punto de arriba, no hace falta repetirlo en cada línea. */}
      <p className={styles.tooltipRow}>
        <span>Horas asignadas</span>
        <b>{formatHours(data.asignadas)}</b>
      </p>
      <p className={styles.tooltipRow}>
        <span>Horas utilizadas</span>
        <b>{formatHours(data.utilizadas)}</b>
      </p>
      {data.desviadas > 0 && (
        <p className={styles.tooltipRow}>
          <span>Horas desviadas</span>
          <b>{formatHours(data.desviadas)}</b>
        </p>
      )}
    </div>
  );
}
