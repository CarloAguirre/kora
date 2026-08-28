import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjectSummary } from '@kora/contracts';
import styles from './ProjectsSummaryChart.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';

interface ProjectsSummaryChartProps {
  projects: readonly ProjectSummary[];
  clientOptions: readonly { value: string; label: string }[];
  /** Solo la tab Desarrollo expone el checkbox "Incluir finalizados" en la v1. */
  showFinalizedToggle?: boolean;
}

type PeriodOption = 'Mensual' | 'Trimestral' | 'Semestral' | 'Anual';

const currentYear = new Date().getFullYear();

const SUB_PERIOD_OPTIONS: Record<PeriodOption, readonly string[]> = {
  Mensual: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  Trimestral: ['Q1 (Ene-Mar)', 'Q2 (Abr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dic)'],
  Semestral: ['S1 (Ene-Jun)', 'S2 (Jul-Dic)'],
  Anual: [String(currentYear - 1), String(currentYear), String(currentYear + 1)],
};

const PERIOD_OPTIONS = (Object.keys(SUB_PERIOD_OPTIONS) as PeriodOption[]).map((period) => ({ value: period, label: period }));

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

function getPeriodRange(period: PeriodOption, detail: string) {
  const options = SUB_PERIOD_OPTIONS[period];
  const detailIndex = options.indexOf(detail);
  if (detailIndex < 0) return null;

  if (period === 'Anual') {
    const year = Number(detail);
    if (!Number.isInteger(year)) return null;
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }

  const monthsPerPeriod = period === 'Mensual' ? 1 : period === 'Trimestral' ? 3 : 6;
  const startMonth = detailIndex * monthsPerPeriod;
  return { start: new Date(currentYear, startMonth, 1), end: new Date(currentYear, startMonth + monthsPerPeriod, 0) };
}

function projectOverlapsPeriod(project: ProjectSummary, period: PeriodOption, detail: string) {
  const range = getPeriodRange(period, detail);
  if (!range) return true;

  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.endDate ? new Date(project.endDate) : null;
  if (!startDate && !endDate) return false;

  const projectStart = startDate ?? endDate!;
  const projectEnd = endDate ?? startDate!;
  const start = Math.min(projectStart.getTime(), projectEnd.getTime());
  const end = Math.max(projectStart.getTime(), projectEnd.getTime());
  return start <= range.end.getTime() && end >= range.start.getTime();
}

/**
 * Franja "Resumen de horas por proyecto" — gráfico de barras + indicadores,
 * igual disposición que la v1 (`renderChart` en `Proyectos/index.tsx`).
 *
 * Estado de filtros totalmente independiente del de la tabla (v1:
 * `devChartFilterCliente`/`devFilterPeriodo`/`devFilterSubPeriodo` aparte de
 * `devLeaderFilters`/`devStatusFilters`): Cliente, Período/Detalle (rango de
 * fechas del proyecto) e "Incluir finalizados". Por defecto solo muestra
 * proyectos con status "active", igual que la v1.
 */
export function ProjectsSummaryChart({ projects, clientOptions, showFinalizedToggle }: ProjectsSummaryChartProps) {
  const [clientFilter, setClientFilter] = useState('');
  const [period, setPeriod] = useState<PeriodOption>('Semestral');
  const [detail, setDetail] = useState<string>(SUB_PERIOD_OPTIONS.Semestral[0] ?? '');
  const [includeFinalized, setIncludeFinalized] = useState(false);

  const changePeriod = (value: PeriodOption) => {
    setPeriod(value);
    setDetail(SUB_PERIOD_OPTIONS[value][0] ?? '');
  };

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (clientFilter && p.client?.id !== clientFilter) return false;
        const statusOk = p.status === 'active' || (showFinalizedToggle && includeFinalized && p.status === 'finished');
        if (!statusOk) return false;
        return projectOverlapsPeriod(p, period, detail);
      }),
    [projects, clientFilter, showFinalizedToggle, includeFinalized, period, detail],
  );

  const chartData = useMemo(
    () =>
      filtered.map((p) => ({
        name: p.name,
        fullName: p.name,
        cliente: p.client?.companyName ?? '-',
        vendidas: p.soldHours,
        consumidas: p.usedHours,
        desviadas: Math.max(p.usedHours - p.soldHours, 0),
      })),
    [filtered],
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, p) => ({
          vendidas: acc.vendidas + p.soldHours,
          consumidas: acc.consumidas + p.usedHours,
          desviadas: acc.desviadas + Math.max(p.usedHours - p.soldHours, 0),
        }),
        { vendidas: 0, consumidas: 0, desviadas: 0 },
      ),
    [filtered],
  );

  return (
    <Card>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Resumen de horas por proyecto</h2>
          <p className={styles.subtitle}>HH Vendidas vs Consumidas — Desviadas</p>
        </div>
        <div className={styles.filtersRow}>
          <Select
            className={styles.clientFilter}
            label="Cliente"
            placeholder="Todos"
            options={clientOptions}
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
          />
          <Select
            className={styles.periodFilter}
            label="Período"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(event) => changePeriod(event.target.value as PeriodOption)}
          />
          <Select
            className={styles.periodFilter}
            label="Detalle"
            options={SUB_PERIOD_OPTIONS[period].map((value) => ({ value, label: value }))}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
          {showFinalizedToggle && (
            <label className={styles.finalizedToggle}>
              <input type="checkbox" checked={includeFinalized} onChange={(event) => setIncludeFinalized(event.target.checked)} />
              <span>Incluir finalizados</span>
            </label>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.chartArea}>
          {/* Cada proyecto reserva un ancho fijo y el contenedor scrollea
              horizontalmente — con muchos proyectos, comprimir todo en el
              ancho visible vuelve las etiquetas ilegibles (mismo ajuste que
              la v1 aplicó en fix(proyectos): improve chart readability). */}
          <div className={styles.chartScroll}>
            <div style={{ minWidth: Math.max(chartData.length * 56, 100) }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="vendidas" name="HH Vendidas" fill="var(--kora-navy)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="consumidas" name="HH Consumidas" fill="var(--kora-lime)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="desviadas" name="HH Desviadas" fill="var(--kora-danger)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={styles.legend}>
            <LegendItem color="var(--kora-navy)" label="HH Vendidas" />
            <LegendItem color="var(--kora-lime)" label="HH Consumidas" />
            <LegendItem color="var(--kora-danger)" label="HH Desviadas" />
          </div>
        </div>

        <div className={styles.indicators}>
          <p className={styles.indicatorsTitle}>Indicadores</p>
          <Indicator label="HH Vendidas" value={totals.vendidas} />
          <Indicator label="HH Consumidas" value={totals.consumidas} tone="brand" />
          <Indicator label="HH Desviadas" value={totals.desviadas} tone="danger" />
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

function Indicator({ label, value, tone }: { label: string; value: number; tone?: 'brand' | 'danger' }) {
  return (
    <div className={styles.indicator}>
      <p className={styles.indicatorLabel}>{label}</p>
      <p className={[styles.indicatorValue, tone ? styles[tone] : ''].filter(Boolean).join(' ')}>
        {formatHours(value)} hrs
      </p>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: Record<string, unknown> }[] }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as { fullName: string; cliente: string; vendidas: number; consumidas: number; desviadas: number };
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{data.fullName}</p>
      <p>Cliente: {data.cliente}</p>
      <p>HH Vendidas: {formatHours(data.vendidas)}</p>
      <p>HH Consumidas: {formatHours(data.consumidas)}</p>
      <p className={styles.tooltipDanger}>HH Desviadas: {formatHours(data.desviadas)}</p>
    </div>
  );
}
