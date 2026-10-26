import { useMemo, useState } from 'react';
import type { ProjectPeriod, ProjectStatus, ProjectSummary, ProjectType } from '@kora/contracts';
import styles from './ProjectsSummaryChart.module.css';
import { niceScale, type Scale } from './chartScale';
import { InfoIcon } from '@/shared/components/icons/Icons';
import { Card } from '@/shared/components/ui/Card';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { useProjectsList } from '../api/projects.queries';

/** Tope de la API por página — el gráfico muestra una sola página con los proyectos que pasan los filtros. */
const CHART_PAGE_SIZE = 200;

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
 * Franja "Resumen de horas por proyecto" — gráfico de barras horizontales tipo
 * "bullet" (una fila por proyecto) + indicadores.
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

  // Lo más desviado arriba; a igual desvío, lo más cerca de agotar sus horas.
  const chartData = useMemo(
    () =>
      filtered
        .map<ChartRow>((p) => ({
          id: p.id,
          name: p.name,
          cliente: p.client?.companyName ?? '-',
          vendidas: p.soldHours,
          consumidas: p.usedHours,
          desviadas: deviationOf(p),
          onDemand: p.supportPlanType === 'on_demand',
        }))
        .sort((a, b) => b.desviadas - a.desviadas || usageRatio(b) - usageRatio(a)),
    [filtered],
  );

  const scale = useMemo(
    () => niceScale(Math.max(0, ...chartData.map((row) => Math.max(row.vendidas, row.consumidas)))),
    [chartData],
  );

  // Lo consumido en soportes "A demanda" va aparte: no tiene horas vendidas
  // contra las cuales compararse, así que inflaría el % de consumo.
  const totals = useMemo(
    () =>
      chartData.reduce(
        (acc, row) => ({
          vendidas: acc.vendidas + (row.onDemand ? 0 : row.vendidas),
          consumidas: acc.consumidas + (row.onDemand ? 0 : row.consumidas),
          consumidasOnDemand: acc.consumidasOnDemand + (row.onDemand ? row.consumidas : 0),
          desviadas: acc.desviadas + row.desviadas,
          desviados: acc.desviados + (row.desviadas > 0 ? 1 : 0),
        }),
        { vendidas: 0, consumidas: 0, consumidasOnDemand: 0, desviadas: 0, desviados: 0 },
      ),
    [chartData],
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
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendSold}`} aria-hidden="true" />
              HH Vendidas
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendUsed}`} aria-hidden="true" />
              HH Consumidas
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.legendOver}`} aria-hidden="true" />
              HH Desviadas
            </span>
          </div>

          {chartData.length === 0 ? (
            <p className={styles.empty}>No hay proyectos para los filtros seleccionados.</p>
          ) : (
            <div className={styles.bullet}>
              <div className={styles.axisRow} aria-hidden="true">
                <span />
                <div className={styles.axis}>
                  {scale.ticks.map((tick) => (
                    <span key={tick} className={styles.axisTick} style={{ left: `${(tick / scale.max) * 100}%` }}>
                      {formatHours(tick)}
                    </span>
                  ))}
                </div>
                <span className={styles.columnHeading}>Consumidas / Vendidas</span>
                <span className={styles.columnHeading}>Desvío</span>
              </div>

              {/* Una fila por proyecto con scroll vertical: el nombre se lee completo
                  sin importar cuántos proyectos pasen los filtros. */}
              <ul className={styles.rows}>
                {chartData.map((row) => (
                  <BulletRow key={row.id} row={row} scale={scale} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.indicators}>
          <p className={styles.indicatorsTitle}>Indicadores</p>
          <ConsumptionIndicator
            consumidas={totals.consumidas}
            vendidas={totals.vendidas}
            consumidasOnDemand={totals.consumidasOnDemand}
          />
          <div className={styles.indicator}>
            <p className={styles.indicatorLabel}>
              HH Desviadas
              <span
                className={styles.indicatorInfo}
                tabIndex={0}
                title="Suma de las horas que cada proyecto consumió por sobre lo vendido. Los proyectos bajo su tope no restan."
              >
                <InfoIcon size={13} />
              </span>
            </p>
            <p className={`${styles.indicatorValue} ${styles.danger}`}>{formatHours(totals.desviadas)} hrs</p>
            <p className={styles.indicatorHint}>
              {totals.desviados > 0 ? (
                <>
                  <span className={styles.indicatorHintDanger}>▲ {totals.desviados}</span> de {chartData.length}{' '}
                  {chartData.length === 1 ? 'proyecto' : 'proyectos'} con desvío
                </>
              ) : (
                'Ningún proyecto con desvío'
              )}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Consumido vs vendido en un solo indicador, con el mismo lenguaje que las filas:
 * fondo = vendido (marca navy al final), verde = consumido, rojo = lo que se pasa.
 */
function ConsumptionIndicator({
  consumidas,
  vendidas,
  consumidasOnDemand,
}: {
  consumidas: number;
  vendidas: number;
  consumidasOnDemand: number;
}) {
  const max = Math.max(consumidas, vendidas, 1);
  const pct = (value: number) => `${(value / max) * 100}%`;
  const ratio = vendidas > 0 ? Math.round((consumidas / vendidas) * 100) : null;

  return (
    <div className={styles.indicator}>
      <p className={styles.indicatorLabel}>HH Consumidas / Vendidas</p>
      <p className={styles.indicatorValue}>
        {formatHours(consumidas)}
        <span className={styles.indicatorValueSecondary}> / {formatHours(vendidas)} hrs</span>
      </p>
      <div className={styles.meter} aria-hidden="true">
        {vendidas > 0 && <span className={styles.soldBar} style={{ width: pct(vendidas) }} />}
        {consumidas > 0 && <span className={styles.usedBar} style={{ width: pct(Math.min(consumidas, vendidas)) }} />}
        {consumidas > vendidas && (
          <span className={styles.overBar} style={{ left: pct(vendidas), width: pct(consumidas - vendidas) }} />
        )}
        {vendidas > 0 && <span className={styles.soldMarker} style={{ left: pct(vendidas) }} />}
      </div>
      {ratio !== null && (
        <p className={styles.indicatorHint}>
          <span className={ratio > 100 ? styles.indicatorHintDanger : undefined}>{formatHours(ratio)}%</span> de lo vendido
        </p>
      )}
      {consumidasOnDemand > 0 && (
        <p className={styles.indicatorHint}>+ {formatHours(consumidasOnDemand)} hrs a demanda (sin tope)</p>
      )}
    </div>
  );
}

interface ChartRow {
  id: string;
  name: string;
  cliente: string;
  vendidas: number;
  consumidas: number;
  desviadas: number;
  onDemand: boolean;
}

const usageRatio = (row: ChartRow) => (row.vendidas > 0 ? row.consumidas / row.vendidas : 0);

/**
 * Fila tipo "bullet": el fondo claro es lo vendido (con una marca al final), la
 * barra interior es lo consumido y la parte que excede lo vendido va en rojo.
 * Los "A demanda" no tienen tope, así que solo muestran lo consumido en neutro.
 */
function BulletRow({ row, scale }: { row: ChartRow; scale: Scale }) {
  const pct = (value: number) => `${(value / scale.max) * 100}%`;
  const withinSold = row.onDemand ? row.consumidas : Math.min(row.consumidas, row.vendidas);

  return (
    <li className={styles.row}>
      <span className={styles.rowLabel} title={`${row.name} — ${row.cliente}`}>
        <span className={styles.rowName}>{row.name}</span>
        <span className={styles.rowClient}>{row.cliente}</span>
      </span>

      <div className={styles.track}>
        {scale.ticks.map((tick) => (
          <span key={tick} className={styles.gridLine} style={{ left: pct(tick) }} aria-hidden="true" />
        ))}
        {!row.onDemand && row.vendidas > 0 && <span className={styles.soldBar} style={{ width: pct(row.vendidas) }} />}
        {withinSold > 0 && (
          <span
            className={row.onDemand ? `${styles.usedBar} ${styles.usedBarNeutral}` : styles.usedBar}
            style={{ width: pct(withinSold) }}
          />
        )}
        {row.desviadas > 0 && (
          <span className={styles.overBar} style={{ left: pct(row.vendidas), width: pct(row.desviadas) }} />
        )}
        {!row.onDemand && row.vendidas > 0 && <span className={styles.soldMarker} style={{ left: pct(row.vendidas) }} />}
      </div>

      <span className={styles.rowValue}>
        {formatHours(row.consumidas)} / {row.onDemand ? '—' : formatHours(row.vendidas)}
      </span>

      {row.onDemand ? (
        <span className={styles.rowStatus}>Sin tope</span>
      ) : row.desviadas > 0 ? (
        <span className={`${styles.rowStatus} ${styles.rowStatusDanger}`}>▲ +{formatHours(row.desviadas)}</span>
      ) : (
        <span className={styles.rowStatus}>{row.vendidas > 0 ? `${Math.round(usageRatio(row) * 100)}%` : '—'}</span>
      )}
    </li>
  );
}
