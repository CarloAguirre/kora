import { useMemo, useState, type ReactNode } from 'react';
import styles from './PhaseRoadmap.module.css';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { ChevronDownIcon, ChevronRightIcon, DiamondIcon } from '@/shared/components/icons/Icons';
import { StatusPill, type StatusPillTone } from './StatusPill';
import { BitacoraEntryRow } from './ProjectBitacora';
import {
  PHASE_ROADMAP_ROLE_COLORS,
  PHASE_ROADMAP_ROLE_LABELS,
  PHASE_ROADMAP_TASK_SCOPES,
  PHASE_ROADMAP_TASK_SCOPE_LABELS,
  type PhaseRoadmapPhase,
  type PhaseRoadmapTask,
  type PhaseRoadmapTaskScope,
  type ProjectPhaseRoadmap,
} from '../types';

/** Paleta entregada por diseño v5.02, exclusiva de la vista interna. */
const OPERATIONAL_ROLE_COLORS: Record<keyof typeof PHASE_ROADMAP_ROLE_LABELS, string> = {
  dev: '#ea7a1f', pmo: '#64748b', qa: '#3b82f6',
  ux: '#22a55a', ia: '#e0526b', rpa: '#14a3a0',
};

const STATUS_LABEL: Readonly<Record<PhaseRoadmapPhase['status'], string>> = {
  finished: 'Finalizado',
  in_progress: 'En Proceso',
  upcoming: 'Próximo',
};

const STATUS_TONE: Readonly<Record<PhaseRoadmapPhase['status'], StatusPillTone>> = {
  finished: 'neutral',
  in_progress: 'info',
  upcoming: 'neutral',
};

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** El zoom pasa de "Semanas" a "Días" ensanchando la pista: 0 → 100% (cabe entera), 100 → 400%. */
const scrollWidthPercent = (zoom: number) => 100 + zoom * 3;
/** Sobre este valor del zoom aparecen la cuadrícula y las etiquetas por día. */
const DETAIL_ZOOM_THRESHOLD = 35;

const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

/** "15 jul" — formato corto de los marcadores de entrega y tarea. */
const formatShortDate = (isoDate: string) => {
  const date = toDate(isoDate);
  return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`;
};

interface DateRange {
  readonly min: Date;
  readonly max: Date;
}

const percentOf = (date: Date, range: DateRange) =>
  ((date.getTime() - range.min.getTime()) / (range.max.getTime() - range.min.getTime())) * 100;

interface TimelineAxis {
  readonly range: DateRange;
  readonly months: readonly { leftPercent: number; widthPercent: number; monthIndex: number }[];
  readonly weekLines: readonly number[];
  readonly dayLines: readonly number[];
  readonly dayTicks: readonly { leftPercent: number; label: string }[];
  /** `null` cuando hoy cae fuera del rango visible. */
  readonly todayPercent: number | null;
}

/** Bloques de mes, cuadrícula y línea de HOY del Gantt, todo en % del rango visible. */
function buildTimelineAxis(range: DateRange): TimelineAxis {
  const months: { leftPercent: number; widthPercent: number; monthIndex: number }[] = [];
  const monthCursor = new Date(range.min.getFullYear(), range.min.getMonth(), 1);
  while (monthCursor <= range.max) {
    const blockStart = monthCursor < range.min ? range.min : monthCursor;
    const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    const blockEnd = nextMonth > range.max ? range.max : nextMonth;
    const leftPercent = percentOf(blockStart, range);
    months.push({
      leftPercent,
      widthPercent: percentOf(blockEnd, range) - leftPercent,
      monthIndex: monthCursor.getMonth(),
    });
    monthCursor.setTime(nextMonth.getTime());
  }

  const weekLines: number[] = [];
  const dayTicks: { leftPercent: number; label: string }[] = [];
  const weekCursor = new Date(range.min);
  let lastTickMonth = -1;
  while (weekCursor <= range.max) {
    const leftPercent = percentOf(weekCursor, range);
    weekLines.push(leftPercent);
    dayTicks.push({
      leftPercent,
      label:
        weekCursor.getMonth() === lastTickMonth
          ? String(weekCursor.getDate())
          : `${weekCursor.getDate()} ${MONTH_LABELS[weekCursor.getMonth()]}`,
    });
    lastTickMonth = weekCursor.getMonth();
    weekCursor.setDate(weekCursor.getDate() + 7);
  }

  const dayLines: number[] = [];
  const dayCursor = new Date(range.min);
  while (dayCursor <= range.max) {
    dayLines.push(percentOf(dayCursor, range));
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  const today = startOfToday();
  const todayPercent = today >= range.min && today <= range.max ? percentOf(today, range) : null;

  return { range, months, weekLines, dayLines, dayTicks, todayPercent };
}

/**
 * "Roadmap por Fases" — reemplaza el Gantt fijo de 3 módulos × 4 tareas
 * (`ProjectGanttChart`, ya borrado) por un acordeón de fases del proyecto
 * (Figma node 9669:31017, variante "Kora · Proyectos y Soporte 2"): cada fase
 * agrupa sus propias tareas por rol de equipo (cantidad variable), sus
 * entregas y las entradas de bitácora relacionadas a esa fase.
 *
 * El calendario es de fechas reales, no de posiciones fijas: barras,
 * marcadores, meses, cuadrícula y línea de HOY se calculan como % del rango
 * visible, igual que el prototipo `ficha_proyecto_lider`. Por eso el filtro
 * "Rango visible" y el zoom Semanas/Días sí cambian la vista (el zoom ensancha
 * la pista y sobre 35 revela la cuadrícula y las etiquetas por día). Solo la
 * columna de pistas hace scroll horizontal: los nombres de cada fila quedan
 * siempre visibles a la izquierda.
 *
 * Los chips de "Resumen de avance" mantienen la píldora navy sólida del
 * Figma, pero están conectados a las tareas reales de la fase (`taskItems`,
 * cada una con su `scope`): el tooltip muestra el % completado por ámbito
 * (mismo cálculo que `ProjectModulesCard` del Roadmap interno) y el clic
 * filtra/atenúa en la fila "Tareas" las que no son de ese ámbito.
 */
export function PhaseRoadmap({
  phaseRoadmap, renderPhaseExtras, renderPhaseReferences, renderSelectionDetail,
  toolbarActions, renderPhaseHeaderName, renderPhaseHeaderActions, borderlessSummary = false,
  alwaysExpanded = false,
  operationalView = false, operationalTaskCount, operationalBlockCount, operationalRows, onPlanOperationalRow,
  operationalMetrics, operationalFooter, operationalPresaleHours,
}: PhaseRoadmapProps) {
  /** Fases abiertas — cada una se abre/cierra por separado (varias a la vez); arranca abierta la primera. */
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<ReadonlySet<string>>(
    () => new Set(phaseRoadmap.phases[0] ? [phaseRoadmap.phases[0].id] : []),
  );
  const togglePhase = (phaseId: string) =>
    setExpandedPhaseIds((current) => {
      const next = new Set(current);
      if (!next.delete(phaseId)) next.add(phaseId);
      return next;
    });
  const [rangeDraft, setRangeDraft] = useState({ from: phaseRoadmap.rangeStartDate, to: phaseRoadmap.rangeEndDate });
  const [appliedRange, setAppliedRange] = useState({ from: phaseRoadmap.rangeStartDate, to: phaseRoadmap.rangeEndDate });

  const axis = useMemo(() => buildTimelineAxis({ min: toDate(appliedRange.from), max: toDate(appliedRange.to) }), [appliedRange]);

  const rangeDraftIsValid = toDate(rangeDraft.from) < toDate(rangeDraft.to);
  const rangeIsCustom = appliedRange.from !== phaseRoadmap.rangeStartDate || appliedRange.to !== phaseRoadmap.rangeEndDate;

  const onResetRange = () => {
    setRangeDraft({ from: phaseRoadmap.rangeStartDate, to: phaseRoadmap.rangeEndDate });
    setAppliedRange({ from: phaseRoadmap.rangeStartDate, to: phaseRoadmap.rangeEndDate });
  };

  return (
    <div className={[styles.wrapper, operationalView ? styles.operationalWrapper : ''].filter(Boolean).join(' ')}>
      {/* Encabezado compacto del prototipo `ficha_proyecto_lider-actualizada.html` (`.roadmap-toolbar`
          + `.roadmap-legend`): chips y rango en un bloque, leyenda en una sola línea con la nota del
          zoom al final. */}
      <div className={[styles.summaryRow, borderlessSummary ? styles.summaryRowBorderless : ''].filter(Boolean).join(' ')}>
        <div className={styles.summaryChips}>
          <span className={styles.summaryChip}>
            <b>{phaseRoadmap.phaseCount}</b> {operationalView ? 'fases' : 'Fases'}
          </span>
          <span className={styles.summaryChip}>
            <b>{operationalView ? (operationalBlockCount ?? phaseRoadmap.teamSegmentCount) : phaseRoadmap.teamSegmentCount}</b> {operationalView ? 'bloques de trabajo' : 'tramos de equipo'}
          </span>
          <span className={styles.summaryChip}>
            <b>{operationalView ? (operationalTaskCount ?? 0) : phaseRoadmap.plannedDeliveryCount}</b> {operationalView ? 'tareas' : 'entregas planificadas'}
          </span>
        </div>
        <div className={styles.filterRow}>
          {!operationalView && <>
          <span className={styles.filterLabel}>Rango visible:</span>
          <TextField
            className={styles.rangeDateField}
            type="date"
            value={rangeDraft.from}
            onChange={(event) => setRangeDraft((current) => ({ ...current, from: event.target.value }))}
          />
          <span>-</span>
          <TextField
            className={styles.rangeDateField}
            type="date"
            value={rangeDraft.to}
            onChange={(event) => setRangeDraft((current) => ({ ...current, to: event.target.value }))}
          />
          <Button size="sm" variant="ghost" onClick={() => setAppliedRange(rangeDraft)} disabled={!rangeDraftIsValid}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={onResetRange} disabled={!rangeIsCustom}>
            Restablecer
          </Button>
          </>}
          {toolbarActions && <div className={styles.toolbarActions}>{toolbarActions}</div>}
        </div>
      </div>

      {operationalView && (
        <div className={styles.operationalExplanation}>
          <strong>Bloque de trabajo:</strong>{' '}
          periodo en que un equipo trabaja en una fase con sus horas estimadas.
          Cada bloque cierra con una sola entrega; si se necesita otra entrega, se crea otro bloque.
        </div>
      )}
      <div className={[styles.legendRow, operationalView ? styles.operationalLegend : ''].filter(Boolean).join(' ')}>
        {operationalView ? <>
          <span className={styles.legendItem}>
            <span className={styles.legendProgress} aria-hidden="true"><i /></span>Avance del bloque
          </span>
          <span className={styles.legendItem}>
            <DiamondIcon size={14} className={styles.legendDiamondPlanned} /> Entrega planificada
          </span>
          <span className={styles.legendItem}>
            <DiamondIcon size={14} className={styles.legendDiamondDone} /> Entregada
          </span>
          <span className={styles.legendItem}>
            <DiamondIcon size={14} className={styles.legendDiamondDelayed} /> Entrega vencida
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendTodayMarker} aria-hidden="true" /> Hoy
          </span>
        </> : <>

        {!operationalView && (Object.keys(PHASE_ROADMAP_ROLE_LABELS) as Array<keyof typeof PHASE_ROADMAP_ROLE_LABELS>).map((role) => (
          <span key={role} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: PHASE_ROADMAP_ROLE_COLORS[role] }} />
            {PHASE_ROADMAP_ROLE_LABELS[role]}
          </span>
        ))}
        <span className={styles.legendItem}>
          <DiamondIcon size={14} className={styles.legendDiamondDone} /> Entrega realizada
        </span>
        <span className={styles.legendItem}>
          <DiamondIcon size={14} className={styles.legendDiamondCommitted} /> Entrega comprometida
        </span>
        <span className={styles.legendItem}>
          <DiamondIcon size={14} className={styles.legendDiamondDelayed} /> Entrega atrasada
        </span>
        {!operationalView && <span className={styles.legendItem}>
          <span className={styles.legendCheck}>✓</span> Tarea terminada
        </span>}
        {!operationalView && <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendTaskMark, styles.taskDotUpcoming].join(' ')} /> Tarea próxima
        </span>}
        {!operationalView && <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendTaskMark, styles.taskDotDelayed].join(' ')} /> Tarea atrasada
        </span>}
        <span className={styles.legendHoy}>— Hoy</span>
        {!operationalView && <span className={styles.hint}>Usa el zoom de cada fase para ver días y tareas.</span>}
        </>}
      </div>
      {operationalView && operationalPresaleHours != null && operationalPresaleHours > 0 && (
        <p className={styles.operationalPresale}>
          Preventa: {new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(operationalPresaleHours)} HH
          de prospecto y cotización registradas antes del inicio. Cuentan como HH consumidas,
          pero no forman parte del plan.
        </p>
      )}

      <div className={styles.phaseList}>
        {phaseRoadmap.phases.map((phase) => operationalView ? (
          <OperationalPhaseCard key={phase.id} phase={phase} axis={axis}
            placeholderRows={operationalRows?.(phase) ?? []}
            onPlanRow={onPlanOperationalRow}
            getMetrics={operationalMetrics}
            renderHeaderName={renderPhaseHeaderName}
            renderHeaderActions={renderPhaseHeaderActions}
            renderReferences={renderPhaseReferences}
            renderSelectionDetail={renderSelectionDetail} />
        ) : (
          <PhaseCard
            key={phase.id}
            phase={phase}
            axis={axis}
            expanded={alwaysExpanded || expandedPhaseIds.has(phase.id)}
            onToggle={() => { if (!alwaysExpanded) togglePhase(phase.id); }}
            staticHeader={alwaysExpanded}
            renderExtras={renderPhaseExtras}
            renderReferences={renderPhaseReferences}
            renderSelectionDetail={renderSelectionDetail}
            renderHeaderName={renderPhaseHeaderName}
            renderHeaderActions={renderPhaseHeaderActions}
          />
        ))}
      </div>
      {operationalView && operationalFooter && <div className={styles.operationalFooter}>{operationalFooter}</div>}
      {operationalView && (
        <details className={styles.operationalDateOptions}>
          <summary>Opciones de cronograma · rango de fechas</summary>
          <div className={styles.filterRow}>
            <TextField className={styles.rangeDateField} type="date" value={rangeDraft.from}
              onChange={(event) => setRangeDraft((current) => ({ ...current, from: event.target.value }))} />
            <span>–</span>
            <TextField className={styles.rangeDateField} type="date" value={rangeDraft.to}
              onChange={(event) => setRangeDraft((current) => ({ ...current, to: event.target.value }))} />
            <Button size="sm" variant="ghost" disabled={!rangeDraftIsValid}
              onClick={() => setAppliedRange(rangeDraft)}>Aplicar</Button>
            <Button size="sm" variant="ghost" disabled={!rangeIsCustom} onClick={onResetRange}>
              Restablecer
            </Button>
          </div>
        </details>
      )}

    </div>
  );
}

/** Geometría de la barra dentro del rango visible; `null` si el tramo queda completamente fuera. */
function barGeometry(task: PhaseRoadmapTask, range: DateRange) {
  const start = toDate(task.startDate);
  const end = toDate(task.endDate);
  if (end < range.min || start > range.max) return null;
  const leftPercent = Math.max(percentOf(start, range), 0);
  const rightPercent = Math.min(percentOf(end, range), 100);
  return { leftPercent, widthPercent: Math.max(rightPercent - leftPercent, 0.8) };
}

/**
 * Qué tramo/entrega/tarea/incidente está seleccionado dentro de una fase — decide
 * qué se muestra en "Registros de bitácora relacionados" (antes se mostraban
 * TODAS las entradas de la fase sin importar la tarea abierta). No hay un id
 * real que conecte una `ProjectObservation` con una tarea o entrega puntual
 * (solo con el módulo/fase completa — ver `project-detail.adapter.ts`), así
 * que el cruce se hace por texto: el título de la entrada contiene la
 * etiqueta de la tarea/entrega (p.ej. "Tarea completada: Casos de prueba
 * conciliación" contiene "Casos de prueba conciliación"). El `id` (cuando
 * viene) identifica el ítem real — lo usa el Roadmap interno para su detalle.
 */
export type PhaseRoadmapSelection =
  | { kind: 'segment' | 'task' | 'delivery' | 'reference-block'; id?: string; label: string }
  | { kind: 'incident' };

const sameSelection = (a: PhaseRoadmapSelection | null, b: PhaseRoadmapSelection) => {
  if (!a) return false;
  if (a.kind === 'incident' || b.kind === 'incident') return a.kind === b.kind;
  if (a.kind !== b.kind) return false;
  return a.id !== undefined && b.id !== undefined ? a.id === b.id : a.label === b.label;
};

export interface OperationalRoadmapRow {
  id: string;
  role: keyof typeof PHASE_ROADMAP_ROLE_LABELS;
  label: string;
  hours: number;
}

export interface PhaseRoadmapProps {
  phaseRoadmap: ProjectPhaseRoadmap;
  /** Contenido extra dentro de cada fase, bajo "Resumen de avance" (p.ej. la etapa editable del Roadmap interno). */
  renderPhaseExtras?: (phase: PhaseRoadmapPhase) => ReactNode;
  /** Referencias EDT en la fase, después del Gantt. Solo vista interna; portal cliente no cambia. */
  renderPhaseReferences?: (phase: PhaseRoadmapPhase) => ReactNode;
  /** Detalle del ítem seleccionado, sobre "Registros de bitácora relacionados" (Roadmap interno). */
  renderSelectionDetail?: (phase: PhaseRoadmapPhase, selection: PhaseRoadmapSelection, clearSelection: () => void) => ReactNode;
  /** Extensiones exclusivas de la ficha interna; si se omiten el portal cliente permanece idéntico. */
  toolbarActions?: ReactNode;
  /** Solo en ficha interna: elimina borde de la barra de filtros sin modificar el portal cliente. */
  borderlessSummary?: boolean;
  /** La ficha interna v5 mantiene todas las fases y su Gantt visibles; solo los detalles interiores colapsan. */
  alwaysExpanded?: boolean;
  /** Diseño operativo v5.02 de la ficha interna; portal del cliente conserva el Roadmap anterior. */
  operationalView?: boolean;
  operationalTaskCount?: number;
  operationalBlockCount?: number;
  onPlanOperationalRow?: (phase: PhaseRoadmapPhase, row: OperationalRoadmapRow) => void;
  /** Bloques de cotización aún sin tramo operativo ni fechas; no se dibujan como barras ficticias. */
  operationalRows?: (phase: PhaseRoadmapPhase) => readonly OperationalRoadmapRow[];
  /** HH y avance comprobables de cada bloque operativo; no se inventan porcentajes. */
  operationalMetrics?: (phase: PhaseRoadmapPhase, task: PhaseRoadmapTask) => { hours: number | null; progress: number | null };
  /** HH reales de preventa previas al Hito 0, fuera del plan operativo. */
  operationalPresaleHours?: number | null;
  /** Acción al final de las fases, exclusiva de la ficha interna. */
  operationalFooter?: ReactNode;
  renderPhaseHeaderName?: (phase: PhaseRoadmapPhase) => ReactNode;
  renderPhaseHeaderActions?: (phase: PhaseRoadmapPhase) => ReactNode;
}

function PhaseCard({
  phase,
  axis,
  expanded,
  onToggle,
  renderExtras,
  renderReferences,
  renderSelectionDetail,
  renderHeaderName,
  renderHeaderActions,
  staticHeader = false,
}: {
  phase: PhaseRoadmapPhase;
  axis: TimelineAxis;
  expanded: boolean;
  onToggle: () => void;
  renderExtras?: PhaseRoadmapProps['renderPhaseExtras'];
  renderReferences?: PhaseRoadmapProps['renderPhaseReferences'];
  renderSelectionDetail?: PhaseRoadmapProps['renderSelectionDetail'];
  renderHeaderName?: PhaseRoadmapProps['renderPhaseHeaderName'];
  renderHeaderActions?: PhaseRoadmapProps['renderPhaseHeaderActions'];
  staticHeader?: boolean;
}) {
  /** Igual que `zoomByModule` en `ProjectModulesCard` (Roadmap interno): un slider real, no un
      toggle decorativo. Es estado de vista local, no una acción a conectar. */
  const [zoom, setZoom] = useState(15);
  const today = startOfToday();
  /** Por debajo de este zoom la pista no ensancha lo suficiente (`scrollWidthPercent`)
   *  para separar tareas cercanas entre sí: sus etiquetas se solapan y quedan
   *  ilegibles. Se reutiliza el mismo umbral que ya revela la cuadrícula/
   *  etiquetas por día — a ese punto ya hay espacio de sobra para ambos. */
  const showDetail = zoom >= DETAIL_ZOOM_THRESHOLD;
  const isFullPeriodView = !showDetail;

  /** Por defecto se selecciona la tarea marcada como "en foco" (`highlighted`)
   *  — así "Registros de bitácora relacionados" arranca mostrando una sola
   *  entrada, igual que al hacer clic en una tarea/entrega/el incidente. */
  const [selectedRelated, setSelectedRelated] = useState<PhaseRoadmapSelection | null>(() => {
    const focusedTask = phase.taskItems.find((taskItem) => taskItem.highlighted);
    return focusedTask ? { kind: 'task', id: focusedTask.id, label: focusedTask.label } : null;
  });

  const toggleSelection = (selection: PhaseRoadmapSelection) =>
    setSelectedRelated((current) => (sameSelection(current, selection) ? null : selection));

  /** Sin selección no se muestra nada — mostrar TODAS las entradas de la fase
   *  por defecto era justo lo que se quería evitar (ver el comentario de
   *  `RelatedBitacoraSelection`). Para una tarea/entrega se muestra solo el
   *  registro más reciente (`relatedBitacora` viene ordenado de más nuevo a
   *  más antiguo), que refleja su estado actual. */
  const filteredBitacora = useMemo(() => {
    if (!selectedRelated) return [];
    if (selectedRelated.kind === 'incident') return phase.relatedBitacora.filter((entry) => entry.kind === 'attention');
    const label = selectedRelated.label.trim().toLowerCase();
    const latest = phase.relatedBitacora.find((entry) => entry.title.toLowerCase().includes(label));
    return latest ? [latest] : [];
  }, [phase.relatedBitacora, selectedRelated]);

  /** Chips de "Resumen de avance": % de avance por ámbito ponderado por HH
   *  (`phase.scopeProgress`, del backend; sin él, % de tareas aprobadas) — clic
   *  filtra/atenúa en la fila "Tareas" las que no son de ese ámbito. */
  const [activeScope, setActiveScope] = useState<PhaseRoadmapTaskScope | null>(null);

  const scopeStats = useMemo(() => {
    const stats = new Map<PhaseRoadmapTaskScope, { total: number; done: number }>();
    for (const item of phase.taskItems) {
      const entry = stats.get(item.scope) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (item.state === 'done') entry.done += 1;
      stats.set(item.scope, entry);
    }
    return stats;
  }, [phase.taskItems]);

  const visibleDeliveries = phase.deliveries
    .map((delivery) => ({ delivery, leftPercent: percentOf(toDate(delivery.date), axis.range) }))
    .filter(({ leftPercent }) => leftPercent >= 0 && leftPercent <= 100);
  const visibleTaskItems = phase.taskItems
    .map((taskItem) => ({ taskItem, leftPercent: percentOf(toDate(taskItem.date), axis.range) }))
    .filter(({ leftPercent }) => leftPercent >= 0 && leftPercent <= 100);

  return (
    <div className={styles.phaseCard}>
      <div
        role={staticHeader ? undefined : 'button'}
        tabIndex={staticHeader ? undefined : 0}
        className={[styles.phaseHeader, staticHeader ? styles.phaseHeaderStatic : ''].filter(Boolean).join(' ')}
        onClick={staticHeader ? undefined : onToggle}
        onKeyDown={staticHeader ? undefined : (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onToggle();
        }}
        aria-expanded={staticHeader ? undefined : expanded}
      >
        <span className={styles.phaseBadge}>{phase.badge}</span>
        {renderHeaderName ? (
          <span className={styles.phaseNameControl}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}>
            {renderHeaderName(phase)}
          </span>
        ) : (
          <span className={styles.phaseName}>{phase.name}</span>
        )}
        <StatusPill tone={STATUS_TONE[phase.status]}>{STATUS_LABEL[phase.status]}</StatusPill>
        <span className={styles.phaseHeaderSpacer} />
        {renderHeaderActions && (
          <span className={styles.phaseHeaderActions}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}>
            {renderHeaderActions(phase)}
          </span>
        )}
        {phase.alertLabel && (
          <button
            type="button"
            className={[styles.alertBadge, sameSelection(selectedRelated, { kind: 'incident' }) ? styles.alertBadgeActive : ''].join(' ')}
            onClick={(event) => {
              event.stopPropagation();
              toggleSelection({ kind: 'incident' });
              if (!expanded && !staticHeader) onToggle();
            }}
          >
            ⚑ {phase.alertLabel}
          </button>
        )}
        {!staticHeader && (expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />)}
      </div>

      {expanded && (
        <div className={styles.phaseBody}>
          <div className={styles.summaryOfProgressRow}>
            <span className={styles.summaryOfProgressLabel}>Resumen de avance</span>
            <div className={styles.stageChips}>
              {PHASE_ROADMAP_TASK_SCOPES.map((scope) => {
                const stats = scopeStats.get(scope);
                const percent =
                  phase.scopeProgress !== undefined
                    ? phase.scopeProgress[scope]
                    : stats && stats.total > 0
                      ? Math.round((stats.done / stats.total) * 100)
                      : null;
                const title =
                  percent !== null
                    ? `${PHASE_ROADMAP_TASK_SCOPE_LABELS[scope]}: ${percent}% (${stats?.done ?? 0}/${stats?.total ?? 0} aprobadas)`
                    : `${PHASE_ROADMAP_TASK_SCOPE_LABELS[scope]}: sin tareas registradas`;
                return (
                  <button
                    key={scope}
                    type="button"
                    className={[styles.stageChip, activeScope === scope ? styles.stageChipActive : ''].join(' ')}
                    title={title}
                    onClick={() => setActiveScope((current) => (current === scope ? null : scope))}
                  >
                    {PHASE_ROADMAP_TASK_SCOPE_LABELS[scope]}
                    {percent !== null && <span className={styles.stageChipPercent}>{percent}%</span>}
                  </button>
                );
              })}
            </div>
            <div className={styles.zoomRow}>
              <span>Semanas</span>
              <input
                type="range"
                min={0}
                max={100}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="Zoom del cronograma: de vista por semanas a vista por días"
              />
              <span>Días</span>
            </div>
          </div>

          {renderExtras?.(phase)}

          <div className={styles.ganttGrid}>
            <div className={styles.ganttLabels}>
              <div className={styles.ganttLabelsHeader} />
              {phase.tasks.map((task, index) => (
                <div key={index} className={styles.taskRowLabel}>
                  <span className={styles.legendDot} style={{ background: PHASE_ROADMAP_ROLE_COLORS[task.role] }} />
                  <span className={styles.taskRowLabelText}>
                    <span className={styles.taskRoleName}>{PHASE_ROADMAP_ROLE_LABELS[task.role]}</span>
                    <span className={styles.taskLabel}>{task.label}</span>
                  </span>
                </div>
              ))}
              {phase.deliveries.length > 0 && <div className={styles.markerRowLabel}>Entregas</div>}
              {phase.taskItems.length > 0 && <div className={styles.markerRowLabel}>Tareas</div>}
            </div>

            <div className={[styles.ganttTracks, showDetail ? styles.ganttTracksDetail : ''].join(' ')}>
              <div className={styles.ganttScroll} style={{ width: `${scrollWidthPercent(zoom)}%` }}>
                <div className={styles.ganttHeader}>
                  {axis.months.map((month, index) => (
                    <span
                      key={index}
                      className={styles.ganttMonth}
                      style={{ left: `${month.leftPercent}%`, width: `${month.widthPercent}%` }}
                    >
                      {MONTH_LABELS[month.monthIndex]}
                    </span>
                  ))}
                  {axis.dayTicks.map((tick, index) => (
                    <span key={index} className={[styles.ganttDayTick, styles.detailOnly].join(' ')} style={{ left: `${tick.leftPercent}%` }}>
                      {tick.label}
                    </span>
                  ))}
                </div>

                {axis.dayLines.map((leftPercent, index) => (
                  <div key={index} className={[styles.ganttDayLine, styles.detailOnly].join(' ')} style={{ left: `${leftPercent}%` }} />
                ))}
                {axis.weekLines.map((leftPercent, index) => (
                  <div key={index} className={styles.ganttWeekLine} style={{ left: `${leftPercent}%` }} />
                ))}
                {axis.todayPercent !== null && (
                  <div className={styles.ganttTodayLine} style={{ left: `${axis.todayPercent}%` }}>
                    <span className={styles.ganttTodayLabel}>HOY</span>
                  </div>
                )}

                {phase.tasks.map((task, index) => {
                  const geometry = barGeometry(task, axis.range);
                  const start = toDate(task.startDate);
                  const end = toDate(task.endDate);
                  const isDone = end < today;
                  const isCurrent = start <= today && today <= end;
                  const selection: PhaseRoadmapSelection = { kind: 'segment', id: task.id, label: task.label };
                  const isSelected = sameSelection(selectedRelated, selection);
                  return (
                    <div key={task.id ?? index} className={styles.trackRow}>
                      <div className={styles.trackRowBg} />
                      {geometry && (
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggleSelection(selection)}
                          className={[
                            styles.ganttBar,
                            start > today ? styles.ganttBarFuture : '',
                            isSelected ? styles.ganttBarSelected : '',
                          ].join(' ')}
                          style={{
                            left: `${geometry.leftPercent}%`,
                            width: `${geometry.widthPercent}%`,
                            background: PHASE_ROADMAP_ROLE_COLORS[task.role],
                          }}
                          title={`${PHASE_ROADMAP_ROLE_LABELS[task.role]} · ${task.label} · ${formatShortDate(task.startDate)} a ${formatShortDate(task.endDate)}`}
                        >
                          {isDone ? `✓ ${PHASE_ROADMAP_ROLE_LABELS[task.role]}` : isCurrent ? 'En curso' : ''}
                        </button>
                      )}
                    </div>
                  );
                })}

                {phase.deliveries.length > 0 && (
                  <div className={styles.trackRow}>
                    {visibleDeliveries.map(({ delivery, leftPercent }, index) => {
                      const selection: PhaseRoadmapSelection = { kind: 'delivery', id: delivery.id, label: delivery.label };
                      const isSelected = sameSelection(selectedRelated, selection);
                      return (
                        <button
                          key={delivery.id ?? index}
                          type="button"
                          className={[styles.markerItem, isSelected ? styles.markerItemHighlighted : ''].join(' ')}
                          style={{ left: `${leftPercent}%` }}
                          title={`${delivery.label} · ${formatShortDate(delivery.date)}`}
                          onClick={() => toggleSelection(selection)}
                        >
                          <DiamondIcon
                            size={18}
                            className={
                              delivery.state === 'delivered'
                                ? styles.legendDiamondDone
                                : delivery.state === 'delayed'
                                  ? styles.legendDiamondDelayed
                                  : styles.legendDiamondCommitted
                            }
                          />
                          {!isFullPeriodView && (
                            <span className={styles.markerLabel}>
                              {delivery.label} ({formatShortDate(delivery.date)})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {phase.taskItems.length > 0 && (
                  <div className={styles.trackRow}>
                    {visibleTaskItems.map(({ taskItem, leftPercent }, index) => {
                      const selection: PhaseRoadmapSelection = { kind: 'task', id: taskItem.id, label: taskItem.label };
                      const isSelected = sameSelection(selectedRelated, selection);
                      const isDimmed = activeScope !== null && taskItem.scope !== activeScope;
                      return (
                        <button
                          key={taskItem.id ?? index}
                          type="button"
                          className={[
                            styles.markerItem,
                            styles.markerItemTask,
                            isSelected ? styles.markerItemHighlighted : '',
                            isDimmed ? styles.markerItemDimmed : '',
                          ].join(' ')}
                          style={{ left: `${leftPercent}%` }}
                          title={`${taskItem.label} · ${formatShortDate(taskItem.date)}`}
                          onClick={() => toggleSelection(selection)}
                        >
                          {/* Terminada = el mismo ✓ que la leyenda (y que las tareas terminadas del Roadmap interno). */}
                          {taskItem.state === 'done' ? (
                            <span className={[styles.legendCheck, styles.markerTaskMark].join(' ')}>✓</span>
                          ) : (
                            <span
                              className={[
                                styles.legendDot,
                                styles.markerTaskMark,
                                taskItem.state === 'delayed' ? styles.taskDotDelayed : styles.taskDotUpcoming,
                              ].join(' ')}
                            />
                          )}
                          {!isFullPeriodView && (
                            <span className={styles.markerLabel}>
                              {taskItem.label} ({formatShortDate(taskItem.date)})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {renderReferences?.(phase)}

          {selectedRelated && renderSelectionDetail?.(phase, selectedRelated, () => setSelectedRelated(null))}

          {phase.relatedBitacora.length > 0 && (
            <div className={styles.relatedBitacora}>
              <div className={styles.relatedBitacoraLabelRow}>
                <span className={styles.relatedBitacoraLabel}>Registros de bitácora relacionados</span>
                {selectedRelated && (
                  <button type="button" className={styles.relatedBitacoraReset} onClick={() => setSelectedRelated(null)}>
                    Quitar selección
                  </button>
                )}
              </div>
              {!selectedRelated ? (
                <p className={styles.relatedBitacoraEmpty}>Haz clic en una tarea, entrega o el incidente para ver su detalle.</p>
              ) : filteredBitacora.length > 0 ? (
                filteredBitacora.map((entry) => <BitacoraEntryRow key={entry.id} entry={entry} />)
              ) : (
                <p className={styles.relatedBitacoraEmpty}>No hay registros de bitácora para esta selección.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Presentación operativa del Roadmap v5.02. No es un segundo modelo de datos:
 * la geometría reutiliza `barGeometry` y `buildTimelineAxis` del Gantt de Kora;
 * las referencias sin fechas nunca reciben posiciones ni barras inventadas.
 */
function OperationalPhaseCard({
  phase, axis, placeholderRows, onPlanRow, getMetrics, renderHeaderName, renderHeaderActions,
  renderReferences, renderSelectionDetail,
}: {
  phase: PhaseRoadmapPhase;
  axis: TimelineAxis;
  placeholderRows: readonly OperationalRoadmapRow[];
  onPlanRow?: PhaseRoadmapProps['onPlanOperationalRow'];
  getMetrics?: PhaseRoadmapProps['operationalMetrics'];
  renderHeaderName?: PhaseRoadmapProps['renderPhaseHeaderName'];
  renderHeaderActions?: PhaseRoadmapProps['renderPhaseHeaderActions'];
  renderReferences?: PhaseRoadmapProps['renderPhaseReferences'];
  renderSelectionDetail?: PhaseRoadmapProps['renderSelectionDetail'];
}) {
  const [selected, setSelected] = useState<PhaseRoadmapSelection | null>(null);
  const [zoom, setZoom] = useState(0);
  const choose = (selection: PhaseRoadmapSelection) =>
    setSelected((current) => sameSelection(current, selection) ? null : selection);
  const hasDatedRows = phase.tasks.length > 0;
  const hasOtherDatedItems = phase.deliveries.length > 0 || phase.taskItems.length > 0;
  const relatedEntries = selected?.kind === 'incident'
    ? phase.relatedBitacora.filter((entry) => entry.kind === 'attention')
    : selected && 'label' in selected
      ? phase.relatedBitacora.filter((entry) =>
          entry.title.toLowerCase().includes(selected.label.trim().toLowerCase())).slice(0, 1)
      : [];
  return (
    <section className={[styles.phaseCard, styles.operationalPhase].join(' ')}
      aria-label={phase.badge + ': ' + phase.name}>
      <div className={[styles.phaseHeader, styles.operationalPhaseHeader].join(' ')}>
        <span className={styles.phaseBadge}>{phase.badge}</span>
        {renderHeaderName ? <span className={styles.phaseNameControl}>{renderHeaderName(phase)}</span> :
          <strong className={styles.phaseName}>{phase.name}</strong>}
        <span className={styles.phaseHeaderSpacer} />
        {renderHeaderActions && <span className={styles.phaseHeaderActions}>
          {renderHeaderActions(phase)}
        </span>}
        {phase.alertLabel && <button type="button" className={styles.alertBadge}
          onClick={() => choose({ kind: 'incident' })}>⚑ {phase.alertLabel}</button>}
      </div>
      <div className={styles.operationalPhaseBody}>
        {(hasDatedRows || placeholderRows.length > 0) && (
          <div className={styles.operationalGantt}>
            {hasDatedRows && (
              <div className={styles.operationalTimelineHeading}>
                <div />
                <div className={styles.operationalAxis}>
                  {axis.dayTicks.map((tick, index) => (
                    <span key={index} style={{ left: tick.leftPercent + '%' }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {phase.tasks.map((task, index) => {
              const geometry = barGeometry(task, axis.range);
              const metrics = getMetrics?.(phase, task);
              const selection: PhaseRoadmapSelection = {
                kind: 'segment', id: task.id, label: task.label,
              };
              const isSelected = sameSelection(selected, selection);
              return <div key={task.id ?? index} className={styles.operationalLine}>
                <button type="button" className={styles.operationalBlockLabel}
                  title={task.label} aria-label={'Ver detalle del bloque ' + task.label}
                  onClick={() => choose(selection)}>
                  <span className={styles.operationalRole}
                    style={{ background: OPERATIONAL_ROLE_COLORS[task.role] }}>
                    {PHASE_ROADMAP_ROLE_LABELS[task.role]}
                  </span>
                  <span className={styles.operationalLabelText}>{task.label}
                    {metrics && <small>{metrics.hours == null ? 'HH sin definir' : metrics.hours + ' HH'} · {metrics.progress == null ? 'avance sin definir' : metrics.progress + '% de avance'}</small>}
                  </span>
                </button>
                <div className={styles.operationalTrack}>
                  {axis.weekLines.map((percent, idx) =>
                    <span key={idx} className={styles.operationalGridLine}
                      style={{ left: percent + '%' }} />)}
                  {axis.todayPercent !== null && <span className={styles.operationalToday}
                    style={{ left: axis.todayPercent + '%' }} />}
                  {geometry && <>
                    <button type="button"
                      className={[styles.operationalBar, isSelected ? styles.operationalBarSelected : ''].join(' ')}
                      aria-label={'Abrir bloque ' + task.label}
                      aria-pressed={isSelected}
                      style={{
                        left: geometry.leftPercent + '%',
                        width: geometry.widthPercent + '%',
                        background: OPERATIONAL_ROLE_COLORS[task.role],
                      }}
                      title={task.label + ' · ' + formatShortDate(task.startDate) + ' a ' + formatShortDate(task.endDate)}
                      onClick={() => choose(selection)}>
                      {metrics?.progress != null && <span className={styles.operationalBarProgress}
                        style={{ width: Math.min(100, Math.max(0, metrics.progress)) + '%' }} />}
                    </button>
                    {(() => {
                      const closed = Boolean(task.closedAt);
                      const plannedPosition = percentOf(toDate(task.endDate), axis.range);
                      const actualDate = task.closedAt?.slice(0, 10);
                      const actualPosition = actualDate
                        ? percentOf(toDate(actualDate), axis.range) : null;
                      const sameDay = actualDate === task.endDate;
                      const overdue = !closed && toDate(task.endDate) < startOfToday();
                      const planned = plannedPosition >= 0 && plannedPosition <= 100;
                      const actual = actualPosition !== null &&
                        actualPosition >= 0 && actualPosition <= 100;
                      return <>
                        {planned && (!closed || !sameDay) && <button type="button"
                          aria-label={(overdue ? 'Cierre vencido ' : 'Cierre planificado ') + task.label}
                          title={'Cierre planificado: ' + formatShortDate(task.endDate)}
                          className={styles.operationalClosureMarker}
                          style={{ left: Math.max(0.6, Math.min(99.4, plannedPosition)) + '%' }}
                          onClick={() => choose(selection)}>
                          <DiamondIcon size={16} className={overdue
                            ? styles.legendDiamondDelayed : styles.legendDiamondPlanned} />
                        </button>}
                        {closed && actual && <button type="button"
                          aria-label={'Cierre real ' + task.label}
                          title={'Cierre real: ' + formatShortDate(actualDate!)}
                          className={styles.operationalClosureMarker}
                          style={{ left: Math.max(0.6, Math.min(99.4, actualPosition)) + '%' }}
                          onClick={() => choose(selection)}>
                          <DiamondIcon size={16} className={styles.legendDiamondDone} />
                        </button>}
                      </>;
                    })()}
                  </>}
                </div>
              </div>;
            })}
            {placeholderRows.map((row) => {
              const selection: PhaseRoadmapSelection = {
                kind: 'reference-block', id: row.id, label: row.label,
              };
              const isSelected = sameSelection(selected, selection);
              return <div key={row.id} className={[
                styles.operationalLine, styles.operationalReferenceRow,
                isSelected ? styles.operationalReferenceSelected : '',
              ].filter(Boolean).join(' ')}>
                <button type="button" className={styles.operationalBlockLabel}
                  title={row.label} aria-label={'Abrir bloque ' + row.label}
                  onClick={() => choose(selection)}>
                  <span className={styles.operationalRole}
                    style={{ background: OPERATIONAL_ROLE_COLORS[row.role] }}>
                    {PHASE_ROADMAP_ROLE_LABELS[row.role]}
                  </span>
                  <span className={styles.operationalLabelText}>
                    {row.label}<small>{row.hours} HH de referencia · sin fechas</small>
                  </span>
                </button>
                <div className={styles.operationalNoDates}>
                  <button type="button" className={styles.operationalOpenReference}
                    onClick={() => choose(selection)}>
                    Sin fechas: se calculan al definir el inicio del proyecto
                  </button>
                  {onPlanRow && <button type="button" onClick={() => onPlanRow(phase, row)}>
                    Planificar bloque
                  </button>}
                </div>
              </div>;
            })}
          </div>
        )}
        {hasOtherDatedItems && (
          <details className={styles.operationalOtherEvents}>
            <summary>Entregas y tareas en el cronograma
              {' · '}{phase.deliveries.length} entregas, {phase.taskItems.length} tareas</summary>
            <div className={styles.operationalZoomRow}>
              <span>Semanas</span>
              <input type="range" min={0} max={100} value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="Zoom de entregas y tareas" />
              <span>Días</span>
            </div>
            <div className={styles.operationalEventViewport}>
              <div className={styles.operationalEventTrack} style={{ width: scrollWidthPercent(zoom) + '%' }}>
                {phase.deliveries.map((delivery, index) => {
                  const selection: PhaseRoadmapSelection = {
                    kind: 'delivery', id: delivery.id, label: delivery.label,
                  };
                  const position = percentOf(toDate(delivery.date), axis.range);
                  return <div key={delivery.id ?? index} className={styles.operationalEventRow}>
                    <span className={styles.operationalEventTitle}>Entrega · {delivery.label}</span>
                    <div className={styles.operationalEventAxis}>
                      {position >= 0 && position <= 100 && <button type="button"
                        aria-label={'Abrir entrega ' + delivery.label}
                        className={styles.operationalEventMarker}
                        style={{ left: position + '%' }}
                        onClick={() => choose(selection)}>
                        <DiamondIcon size={17} className={
                          delivery.state === 'delivered' ? styles.legendDiamondDone :
                          delivery.state === 'delayed' ? styles.legendDiamondDelayed : styles.legendDiamondCommitted
                        } />
                      </button>}
                    </div>
                  </div>;
                })}
                {phase.taskItems.map((task, index) => {
                  const selection: PhaseRoadmapSelection = {
                    kind: 'task', id: task.id, label: task.label,
                  };
                  const position = percentOf(toDate(task.date), axis.range);
                  return <div key={task.id ?? index} className={styles.operationalEventRow}>
                    <span className={styles.operationalEventTitle}>Tarea · {task.label}</span>
                    <div className={styles.operationalEventAxis}>
                      {position >= 0 && position <= 100 && <button type="button"
                        aria-label={'Abrir tarea ' + task.label}
                        className={styles.operationalEventMarker}
                        style={{ left: position + '%' }}
                        onClick={() => choose(selection)}>
                        {task.state === 'done' ? <span className={styles.legendCheck}>✓</span> :
                          <span className={[
                            styles.legendDot, styles.legendTaskMark,
                            task.state === 'delayed' ? styles.taskDotDelayed : styles.taskDotUpcoming,
                          ].join(' ')} />}
                      </button>}
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </details>
        )}
        {renderReferences?.(phase)}
        {selected && renderSelectionDetail?.(phase, selected, () => setSelected(null))}
        {selected && phase.relatedBitacora.length > 0 && (
          <div className={styles.relatedBitacora}>
            <div className={styles.relatedBitacoraLabelRow}>
              <span className={styles.relatedBitacoraLabel}>Registros de bitácora relacionados</span>
              <button type="button" className={styles.relatedBitacoraReset}
                onClick={() => setSelected(null)}>Quitar selección</button>
            </div>
            {relatedEntries.length
              ? relatedEntries.map((entry) => <BitacoraEntryRow key={entry.id} entry={entry} />)
              : <p className={styles.relatedBitacoraEmpty}>No hay registros para esta selección.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
