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
 * atenúa los tramos y las tareas que no son de ese ámbito (el de cada tramo se
 * deriva de su rol en el adapter).
 */
export function PhaseRoadmap({ phaseRoadmap, renderPhaseExtras, renderSelectionDetail }: PhaseRoadmapProps) {
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
    <div className={styles.wrapper}>
      {/* Encabezado compacto del prototipo `ficha_proyecto_lider-actualizada.html` (`.roadmap-toolbar`
          + `.roadmap-legend`): chips y rango en un bloque, leyenda en una sola línea con la nota del
          zoom al final. */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryChips}>
          <span className={styles.summaryChip}>
            <b>{phaseRoadmap.phaseCount}</b> Fases
          </span>
          <span className={styles.summaryChip}>
            <b>{phaseRoadmap.teamSegmentCount}</b> tramos de equipo
          </span>
          <span className={styles.summaryChip}>
            <b>{phaseRoadmap.plannedDeliveryCount}</b> entregas planificadas
          </span>
        </div>
        <div className={styles.filterRow}>
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
        </div>
      </div>

      <div className={styles.legendRow}>
        {(Object.keys(PHASE_ROADMAP_ROLE_LABELS) as Array<keyof typeof PHASE_ROADMAP_ROLE_LABELS>).map((role) => (
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
        <span className={styles.legendItem}>
          <span className={styles.legendCheck}>✓</span> Tarea terminada
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendTaskMark, styles.taskDotUpcoming].join(' ')} /> Tarea próxima
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendTaskMark, styles.taskDotDelayed].join(' ')} /> Tarea atrasada
        </span>
        <span className={styles.legendHoy}>— Hoy</span>
        <span className={styles.hint}>Usa el zoom de cada fase para ver días y tareas.</span>
      </div>

      <div className={styles.phaseList}>
        {phaseRoadmap.phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            axis={axis}
            expanded={expandedPhaseIds.has(phase.id)}
            onToggle={() => togglePhase(phase.id)}
            renderExtras={renderPhaseExtras}
            renderSelectionDetail={renderSelectionDetail}
          />
        ))}
      </div>
    </div>
  );
}

/** Aviso bajo los chips de "Resumen de avance" con el ámbito activo — sin él, elegir un ámbito sin
 *  tramos ni tareas parecía no hacer nada. */
function ScopeFilterNotice({
  scope,
  segmentCount,
  taskCount,
  onClear,
}: {
  scope: PhaseRoadmapTaskScope;
  segmentCount: number;
  taskCount: number;
  onClear: () => void;
}) {
  const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;
  return (
    <div className={styles.scopeFilterNotice}>
      <span>
        Filtrando por <b>{PHASE_ROADMAP_TASK_SCOPE_LABELS[scope]}</b>:{' '}
        {segmentCount === 0 && taskCount === 0
          ? 'sin tramos ni tareas en este ámbito.'
          : `${plural(segmentCount, 'tramo', 'tramos')} y ${plural(taskCount, 'tarea', 'tareas')}.`}
      </span>
      <button type="button" className={styles.relatedBitacoraReset} onClick={onClear}>
        Quitar filtro
      </button>
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
  | { kind: 'segment' | 'task' | 'delivery'; id?: string; label: string }
  | { kind: 'incident' };

const sameSelection = (a: PhaseRoadmapSelection | null, b: PhaseRoadmapSelection) => {
  if (!a) return false;
  if (a.kind === 'incident' || b.kind === 'incident') return a.kind === b.kind;
  if (a.kind !== b.kind) return false;
  return a.id !== undefined && b.id !== undefined ? a.id === b.id : a.label === b.label;
};

export interface PhaseRoadmapProps {
  phaseRoadmap: ProjectPhaseRoadmap;
  /** Contenido extra dentro de cada fase, bajo "Resumen de avance" (p.ej. la etapa editable del Roadmap interno). */
  renderPhaseExtras?: (phase: PhaseRoadmapPhase) => ReactNode;
  /** Detalle del ítem seleccionado, sobre "Registros de bitácora relacionados" (Roadmap interno). */
  renderSelectionDetail?: (phase: PhaseRoadmapPhase, selection: PhaseRoadmapSelection, clearSelection: () => void) => ReactNode;
}

function PhaseCard({
  phase,
  axis,
  expanded,
  onToggle,
  renderExtras,
  renderSelectionDetail,
}: {
  phase: PhaseRoadmapPhase;
  axis: TimelineAxis;
  expanded: boolean;
  onToggle: () => void;
  renderExtras?: PhaseRoadmapProps['renderPhaseExtras'];
  renderSelectionDetail?: PhaseRoadmapProps['renderSelectionDetail'];
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
   *  atenúa los tramos (barras) y las tareas que no son de ese ámbito. */
  const [activeScope, setActiveScope] = useState<PhaseRoadmapTaskScope | null>(null);
  const isOutOfScope = (scope: PhaseRoadmapTaskScope) => activeScope !== null && scope !== activeScope;

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
        role="button"
        tabIndex={0}
        className={styles.phaseHeader}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onToggle();
        }}
        aria-expanded={expanded}
      >
        <span className={styles.phaseBadge}>{phase.badge}</span>
        <span className={styles.phaseName}>{phase.name}</span>
        <StatusPill tone={STATUS_TONE[phase.status]}>{STATUS_LABEL[phase.status]}</StatusPill>
        <span className={styles.phaseHeaderSpacer} />
        {phase.alertLabel && (
          <button
            type="button"
            className={[styles.alertBadge, sameSelection(selectedRelated, { kind: 'incident' }) ? styles.alertBadgeActive : ''].join(' ')}
            onClick={(event) => {
              event.stopPropagation();
              toggleSelection({ kind: 'incident' });
              if (!expanded) onToggle();
            }}
          >
            ⚑ {phase.alertLabel}
          </button>
        )}
        {expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
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

          {activeScope !== null && (
            <ScopeFilterNotice
              scope={activeScope}
              segmentCount={phase.tasks.filter((task) => task.scope === activeScope).length}
              taskCount={phase.taskItems.filter((taskItem) => taskItem.scope === activeScope).length}
              onClear={() => setActiveScope(null)}
            />
          )}

          {renderExtras?.(phase)}

          <div className={styles.ganttGrid}>
            <div className={styles.ganttLabels}>
              <div className={styles.ganttLabelsHeader} />
              {phase.tasks.map((task, index) => (
                <div key={index} className={[styles.taskRowLabel, isOutOfScope(task.scope) ? styles.scopeDimmed : ''].join(' ')}>
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
                            isOutOfScope(task.scope) ? styles.scopeDimmed : '',
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
                      return (
                        <button
                          key={taskItem.id ?? index}
                          type="button"
                          className={[
                            styles.markerItem,
                            styles.markerItemTask,
                            isSelected ? styles.markerItemHighlighted : '',
                            isOutOfScope(taskItem.scope) ? styles.scopeDimmed : '',
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
