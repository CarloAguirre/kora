import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjectPeriod, ProjectStatus, ProjectSummary, ProjectType } from '@kora/contracts';
import styles from './ProjectsSummaryChart.module.css';
import { Card } from '@/shared/components/ui/Card';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { useProjectsList } from '../api/projects.queries';

/** Tope de la API por página — el gráfico muestra una sola página con los proyectos que pasan los filtros. */
const CHART_PAGE_SIZE = 200;

// Valores originales del gráfico: Recharts ajusta únicamente el espacio
// adicional que las etiquetas inclinadas necesiten al renderizarse.
const X_AXIS_MIN_HEIGHT = 70;
const PROJECT_MIN_WIDTH = 56;
const LABEL_CLEARANCE = 6;

interface ProjectsSummaryChartProps {
  type: ProjectType;
  clientOptions: readonly { value: string; label: string }[];
  /** Solo la tab Desarrollo expone el filtro de estado (Activos/Finalizados/Todos). */
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

// Cada valor de Detalle (S1, Q2, Marzo, 2026, ...) es único entre todos los
// tipos de período, así que basta este mapa inverso para saber a qué tipo
// pertenece sin depender de qué "Período" esté seleccionado en ese momento.
const DETAIL_TO_PERIOD: Record<string, PeriodOption> = {};
(Object.keys(SUB_PERIOD_OPTIONS) as PeriodOption[]).forEach((period) => {
  SUB_PERIOD_OPTIONS[period].forEach((detail) => {
    DETAIL_TO_PERIOD[detail] = period;
  });
});

type StatusFilter = 'active' | 'finished';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'finished', label: 'Finalizados' },
];

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
// Los soportes "A demanda" no tienen tope de horas: lo consumido nunca es desvío.
const deviationOf = (project: ProjectSummary) =>
  project.supportPlanType === 'on_demand' ? 0 : Math.max(project.usedHours - project.soldHours, 0);

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

// Fecha local `YYYY-MM-DD` — `toISOString()` la pasaría a UTC y en Chile correría el día.
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Rangos de fechas de los Detalle seleccionados, para filtrar en la API. Vacío = sin restricción. */
function detailsToPeriods(details: readonly string[]): ProjectPeriod[] {
  return details.flatMap((detail) => {
    const periodType = DETAIL_TO_PERIOD[detail];
    const range = periodType ? getPeriodRange(periodType, detail) : null;
    return range ? [{ from: toIsoDate(range.start), to: toIsoDate(range.end) }] : [];
  });
}

/**
 * Franja "Resumen de horas por proyecto" — gráfico de barras + indicadores,
 * igual disposición que la v1 (`renderChart` en `Proyectos/index.tsx`).
 *
 * Estado de filtros totalmente independiente del de la tabla (v1:
 * `devChartFilterCliente`/`devFilterPeriodo`/`devFilterSubPeriodo` aparte de
 * `devLeaderFilters`/`devStatusFilters`): Cliente, Período/Detalle (rango de
 * fechas del proyecto) e "Incluir finalizados". Por defecto solo muestra
 * proyectos con status "active", igual que la v1. Los filtros viajan a la API
 * (`clientIds`/`status`/`period`), así que solo se piden los proyectos que
 * el gráfico va a mostrar.
 */
export function ProjectsSummaryChart({ type, clientOptions, showFinalizedToggle }: ProjectsSummaryChartProps) {
  const [clientFilters, setClientFilters] = useState<string[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>(['Semestral']);
  const [details, setDetails] = useState<string[]>([SUB_PERIOD_OPTIONS.Semestral[0] ?? '']);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>(['active']);

  // Sin períodos seleccionados, Detalle ofrece todas las sub-opciones (igual
  // que Cliente/Estado: vacío = sin restricción, no "ninguno").
  const availablePeriods = periods.length > 0 ? periods : (PERIOD_OPTIONS.map((o) => o.value) as PeriodOption[]);
  const detailOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const p of availablePeriods) {
      for (const d of SUB_PERIOD_OPTIONS[p]) {
        if (!seen.has(d)) {
          seen.add(d);
          options.push({ value: d, label: d });
        }
      }
    }
    return options;
  }, [availablePeriods.join('|')]);

  const changePeriods = (next: string[]) => {
    const nextPeriods = next as PeriodOption[];
    setPeriods(nextPeriods);
    const allowed = new Set(
      (nextPeriods.length > 0 ? nextPeriods : (PERIOD_OPTIONS.map((o) => o.value) as PeriodOption[])).flatMap(
        (p) => SUB_PERIOD_OPTIONS[p],
      ),
    );
    setDetails((current) => current.filter((d) => allowed.has(d)));
  };

  const status: ProjectStatus[] | undefined = showFinalizedToggle
    ? statusFilters.length > 0
      ? statusFilters
      : undefined
    : ['active'];
  const period = detailsToPeriods(details);
  const { data } = useProjectsList({
    type,
    clientIds: clientFilters.length > 0 ? clientFilters : undefined,
    status,
    period: period.length > 0 ? period : undefined,
    page: 1,
    pageSize: CHART_PAGE_SIZE,
  });
  const filtered = useMemo(() => data?.items ?? [], [data]);

  const chartData = useMemo(
    () =>
      filtered.map((p) => ({
        name: p.name,
        fullName: p.name,
        cliente: p.client?.companyName ?? '-',
        vendidas: p.soldHours,
        consumidas: p.usedHours,
        desviadas: deviationOf(p),
        onDemand: p.supportPlanType === 'on_demand',
      })),
    [filtered],
  );

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [axisLayout, setAxisLayout] = useState({ extraHeight: 0, leftPadding: 0 });

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    let frame: number | null = null;
    const measure = () => {
      const svg = container.querySelector<SVGSVGElement>('svg.recharts-surface');
      const ticks = Array.from(
        container.querySelectorAll<SVGTextElement>('.recharts-xAxis .recharts-cartesian-axis-tick-value'),
      );
      if (!svg || ticks.length === 0) {
        if (chartData.length === 0) {
          setAxisLayout((previous) =>
            previous.extraHeight === 0 && previous.leftPadding === 0
              ? previous
              : { extraHeight: 0, leftPadding: 0 },
          );
        }
        return;
      }

      // getBoundingClientRect incluye la rotación SVG y la fuente real.
      // A diferencia de estimar caracteres, mide el espacio efectivamente
      // ocupado por los nombres, incluyendo los que salen del viewport.
      const bounds = ticks.map((tick) => tick.getBoundingClientRect()).filter((rect) => rect.height > 0);
      if (bounds.length === 0) return;

      const surface = svg.getBoundingClientRect();
      const bottom = Math.max(...bounds.map((rect) => rect.bottom));
      const left = Math.min(...bounds.map((rect) => rect.left));
      setAxisLayout((previous) => {
        const extraHeight = Math.max(
          0,
          Math.ceil(previous.extraHeight + bottom + LABEL_CLEARANCE - surface.bottom),
        );
        const leftPadding = Math.max(
          0,
          Math.ceil(previous.leftPadding + surface.left + LABEL_CLEARANCE - left),
        );
        if (Math.abs(extraHeight - previous.extraHeight) < 2 && Math.abs(leftPadding - previous.leftPadding) < 2) {
          return previous;
        }
        return { extraHeight, leftPadding };
      });
    };

    const scheduleMeasure = () => {
      if (typeof requestAnimationFrame !== 'function') return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };

    // ResponsiveContainer calcula su anchura después del primer render.
    // Observar las etiquetas garantiza la medición también tras cambios
    // de filtros, de tamaño de ventana o del propio gráfico.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleMeasure);
    mutations?.observe(container, { childList: true, subtree: true, characterData: true });
    const resizing = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resizing?.observe(container);
    scheduleMeasure();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      mutations?.disconnect();
      resizing?.disconnect();
    };
  }, [chartData, axisLayout.extraHeight, axisLayout.leftPadding]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, p) => ({
          vendidas: acc.vendidas + p.soldHours,
          consumidas: acc.consumidas + p.usedHours,
          desviadas: acc.desviadas + deviationOf(p),
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
          <MultiSelect
            className={styles.clientFilter}
            label="Cliente"
            placeholder="Todos"
            searchPlaceholder="Buscar cliente"
            options={clientOptions}
            value={clientFilters}
            onChange={setClientFilters}
          />
          <MultiSelect
            className={styles.periodFilter}
            label="Período"
            placeholder="Todos"
            searchPlaceholder="Buscar período"
            options={PERIOD_OPTIONS}
            value={periods}
            onChange={changePeriods}
          />
          <MultiSelect
            className={styles.periodFilter}
            label="Detalle"
            placeholder="Todos"
            searchPlaceholder="Buscar detalle"
            options={detailOptions}
            value={details}
            onChange={setDetails}
          />
          {showFinalizedToggle && (
            <MultiSelect
              className={styles.periodFilter}
              label="Estado"
              placeholder="Todos"
              searchPlaceholder="Buscar estado"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilters}
              onChange={(next) => setStatusFilters(next as StatusFilter[])}
            />
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.chartArea}>
          {/* Misma inclinación (-35°) y separación original de las barras;
              el espacio adicional lo determinan las etiquetas renderizadas. */}
          <div className={styles.chartScroll} ref={chartContainerRef}>
            <div style={{ minWidth: Math.max(chartData.length * PROJECT_MIN_WIDTH, 100) }}>
              <ResponsiveContainer width="100%" height={280 + axisLayout.extraHeight}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-surface-disabled)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={X_AXIS_MIN_HEIGHT + axisLayout.extraHeight}
                    padding={{ left: axisLayout.leftPadding }}
                  />
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
  const data = payload[0]?.payload as {
    fullName: string;
    cliente: string;
    vendidas: number;
    consumidas: number;
    desviadas: number;
    onDemand: boolean;
  };
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{data.fullName}</p>
      <p>Cliente: {data.cliente}</p>
      <p>HH Vendidas: {data.onDemand ? 'No aplica' : formatHours(data.vendidas)}</p>
      <p>HH Consumidas: {formatHours(data.consumidas)}</p>
      <p className={styles.tooltipDanger}>HH Desviadas: {data.onDemand ? 'No aplica' : formatHours(data.desviadas)}</p>
    </div>
  );
}
