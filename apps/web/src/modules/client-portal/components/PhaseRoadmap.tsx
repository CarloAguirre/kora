import { useMemo, useState, type ReactNode } from 'react';
import styles from './PhaseRoadmap.module.css';
import { Button } from '@/shared/components/ui/Button';
import { DropdownMenu } from '@/shared/components/ui/DropdownMenu';
import { TextField } from '@/shared/components/ui/TextField';
import { ChevronDownIcon, ChevronRightIcon, DiamondIcon } from '@/shared/components/icons/Icons';
import { StatusPill, type StatusPillTone } from './StatusPill';
import { BitacoraEntryRow } from './ProjectBitacora';
import {
  PHASE_ROADMAP_ROLE_COLORS,
  PHASE_ROADMAP_ROLE_LABELS,
  type PhaseRoadmapDeliveryState,
  type PhaseRoadmapPhase,
  type PhaseRoadmapTask,
  type PhaseRoadmapTaskItemState,
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
/** Ancho mínimo (% de la pista) de un bloque de mes para mostrar su nombre. */
const MIN_MONTH_LABEL_PERCENT = 6;

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

const shiftDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Rango propio de una fase: de su primer a su último tramo/entrega/tarea, con una semana de margen y
 * al menos 4 semanas de ancho. Con la escala del proyecto completo una fase corta (p.ej. dos semanas
 * de pruebas al final) quedaba comprimida en una esquina y había que desplazarse para encontrarla.
 * `null` si la fase no tiene nada con fecha.
 */
function phaseRange(phase: PhaseRoadmapPhase): DateRange | null {
  const dates = [
    ...phase.tasks.flatMap((task) => [task.startDate, task.endDate]),
    ...phase.deliveries.map((delivery) => delivery.date),
    ...phase.taskItems.map((taskItem) => taskItem.date),
  ].sort();
  if (dates.length === 0) return null;
  const min = shiftDays(toDate(dates[0]!), -7);
  const max = shiftDays(toDate(dates[dates.length - 1]!), 7);
  const minimumMax = shiftDays(min, 28);
  return { min, max: max < minimumMax ? minimumMax : max };
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
 * visible, igual que el prototipo `ficha_proyecto_lider`. Cada fase abre en su
 * propio rango de fechas (`phaseRange`); el filtro "Rango visible" aplicado a
 * mano lo reemplaza para todas, y el zoom Semanas/Días ensancha la pista (sobre
 * 35 revela la cuadrícula y las etiquetas por día). Solo la
 * columna de pistas hace scroll horizontal: los nombres de cada fila quedan
 * siempre visibles a la izquierda.
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

  /** Sin un "Rango visible" aplicado a mano, cada fase abre en su propio rango (`phaseRange`); con uno, todas usan ese. */
  const axisByPhase = useMemo(
    () =>
      new Map(
        phaseRoadmap.phases.map((phase) => {
          const range = rangeIsCustom ? null : phaseRange(phase);
          return [phase.id, range ? buildTimelineAxis(range) : axis];
        }),
      ),
    [phaseRoadmap.phases, rangeIsCustom, axis],
  );

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
            axis={axisByPhase.get(phase.id) ?? axis}
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

/** Geometría de la barra dentro del rango visible; `null` si el tramo queda completamente fuera. */
function barGeometry(task: PhaseRoadmapTask, range: DateRange) {
  const start = toDate(task.startDate);
  const end = toDate(task.endDate);
  if (end < range.min || start > range.max) return null;
  const leftPercent = Math.max(percentOf(start, range), 0);
  const rightPercent = Math.min(percentOf(end, range), 100);
  return { leftPercent, widthPercent: Math.max(rightPercent - leftPercent, 0.8) };
}

const DELIVERY_STATE_LABEL: Readonly<Record<PhaseRoadmapDeliveryState, string>> = {
  delivered: 'Realizada',
  committed: 'Comprometida',
  delayed: 'Atrasada',
};

const TASK_ITEM_STATE_LABEL: Readonly<Record<PhaseRoadmapTaskItemState, string>> = {
  done: 'Terminada',
  upcoming: 'Próxima',
  delayed: 'Atrasada',
};

/** Mayor = más urgente: un grupo de marcadores muestra el símbolo del más urgente, así un atraso no queda escondido. */
const DELIVERY_URGENCY: Readonly<Record<PhaseRoadmapDeliveryState, number>> = { delivered: 0, committed: 1, delayed: 2 };
const TASK_ITEM_URGENCY: Readonly<Record<PhaseRoadmapTaskItemState, number>> = { done: 0, upcoming: 1, delayed: 2 };

const deliverySymbol = (state: PhaseRoadmapDeliveryState) => (
  <DiamondIcon
    size={18}
    className={
      state === 'delivered'
        ? styles.legendDiamondDone
        : state === 'delayed'
          ? styles.legendDiamondDelayed
          : styles.legendDiamondCommitted
    }
  />
);

/** Terminada = el mismo ✓ que la leyenda (y que las tareas terminadas del Roadmap interno). */
const taskItemSymbol = (state: PhaseRoadmapTaskItemState) =>
  state === 'done' ? (
    <span className={[styles.legendCheck, styles.markerTaskMark].join(' ')}>✓</span>
  ) : (
    <span
      className={[styles.legendDot, styles.markerTaskMark, state === 'delayed' ? styles.taskDotDelayed : styles.taskDotUpcoming].join(' ')}
    />
  );

/** Una entrega o tarea puntual de la fila "Entregas"/"Tareas", ya con su símbolo resuelto. */
interface TimelineMarker {
  readonly key: string;
  readonly label: string;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
  readonly urgency: number;
  readonly symbol: ReactNode;
  readonly stateLabel: string;
  readonly selection: PhaseRoadmapSelection;
}

/**
 * Fila de marcadores de una fase. Los que caen el mismo día se dibujan como un solo marcador
 * con contador ("2 entregas (8 Oct)") que abre la lista para elegir uno — antes se dibujaban
 * todos en el mismo punto, encimados e ilegibles, y solo el de arriba se podía clicar.
 */
function MarkerTrackRow({
  markers,
  range,
  variant,
  pluralNoun,
  showLabels,
  selected,
  onSelect,
}: {
  markers: readonly TimelineMarker[];
  range: DateRange;
  variant: 'delivery' | 'task';
  /** "entregas" / "tareas" — etiqueta de un grupo. */
  pluralNoun: string;
  showLabels: boolean;
  selected: PhaseRoadmapSelection | null;
  onSelect: (selection: PhaseRoadmapSelection) => void;
}) {
  const groups = new Map<string, TimelineMarker[]>();
  for (const marker of markers) groups.set(marker.date, [...(groups.get(marker.date) ?? []), marker]);
  const visibleGroups = [...groups]
    .map(([date, items]) => ({ date, items, leftPercent: percentOf(toDate(date), range) }))
    .filter(({ leftPercent }) => leftPercent >= 0 && leftPercent <= 100);
  const itemClassName = (isSelected: boolean) =>
    [styles.markerItem, variant === 'task' ? styles.markerItemTask : '', isSelected ? styles.markerItemHighlighted : ''].join(' ');

  return (
    <div className={styles.trackRow}>
      {visibleGroups.map(({ date, items, leftPercent }) => {
        if (items.length === 1) {
          const marker = items[0]!;
          return (
            <button
              key={marker.key}
              type="button"
              className={itemClassName(sameSelection(selected, marker.selection))}
              style={{ left: `${leftPercent}%` }}
              title={`${marker.label} · ${formatShortDate(date)}`}
              onClick={() => onSelect(marker.selection)}
            >
              {marker.symbol}
              {showLabels && (
                <span className={styles.markerLabel}>
                  {marker.label} ({formatShortDate(date)})
                </span>
              )}
            </button>
          );
        }

        const lead = items.reduce((current, marker) => (marker.urgency > current.urgency ? marker : current));
        const isSelected = items.some((marker) => sameSelection(selected, marker.selection));
        return (
          <div
            key={date}
            className={[
              styles.markerGroup,
              variant === 'task' ? styles.markerItemTask : '',
              isSelected ? styles.markerGroupHighlighted : '',
            ].join(' ')}
            style={{ left: `${leftPercent}%` }}
          >
            <DropdownMenu
              align="left"
              trigger={({ onClick, open }) => (
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  className={itemClassName(isSelected)}
                  title={`${items.map((marker) => marker.label).join(' · ')} · ${formatShortDate(date)}`}
                  onClick={onClick}
                >
                  <span className={styles.markerSymbol}>
                    {lead.symbol}
                    <span className={styles.markerCount}>{items.length}</span>
                  </span>
                  {showLabels && (
                    <span className={styles.markerLabel}>
                      {items.length} {pluralNoun} ({formatShortDate(date)})
                    </span>
                  )}
                  {showLabels && <ChevronDownIcon size={12} className={styles.markerChevron} />}
                </button>
              )}
              items={items.map((marker) => ({
                key: marker.key,
                label: marker.label,
                icon: marker.symbol,
                hint: marker.stateLabel,
                active: sameSelection(selected, marker.selection),
                onSelect: () => onSelect(marker.selection),
              }))}
            />
          </div>
        );
      })}
    </div>
  );
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
  /** Contenido extra dentro de cada fase, bajo el zoom (p.ej. los datos de la fase del Roadmap interno). */
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
      toggle decorativo. Es estado de vista local, no una acción a conectar. Arranca en 0: con el
      rango propio de la fase (`phaseRange`) la fase entera cabe sin desplazarse. */
  const [zoom, setZoom] = useState(0);
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

  const deliveryMarkers: TimelineMarker[] = phase.deliveries.map((delivery, index) => ({
    key: delivery.id ?? `delivery-${index}`,
    label: delivery.label,
    date: delivery.date,
    urgency: DELIVERY_URGENCY[delivery.state],
    symbol: deliverySymbol(delivery.state),
    stateLabel: DELIVERY_STATE_LABEL[delivery.state],
    selection: { kind: 'delivery', id: delivery.id, label: delivery.label },
  }));
  const taskItemMarkers: TimelineMarker[] = phase.taskItems.map((taskItem, index) => ({
    key: taskItem.id ?? `task-${index}`,
    label: taskItem.label,
    date: taskItem.date,
    urgency: TASK_ITEM_URGENCY[taskItem.state],
    symbol: taskItemSymbol(taskItem.state),
    stateLabel: TASK_ITEM_STATE_LABEL[taskItem.state],
    selection: { kind: 'task', id: taskItem.id, label: taskItem.label },
  }));

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
                      {/* Un mes que apenas asoma en el borde (p.ej. el rango parte el 30) no lleva nombre: se encimaba con el siguiente. */}
                      {month.widthPercent >= MIN_MONTH_LABEL_PERCENT && MONTH_LABELS[month.monthIndex]}
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
                  <MarkerTrackRow
                    markers={deliveryMarkers}
                    range={axis.range}
                    variant="delivery"
                    pluralNoun="entregas"
                    showLabels={!isFullPeriodView}
                    selected={selectedRelated}
                    onSelect={toggleSelection}
                  />
                )}

                {phase.taskItems.length > 0 && (
                  <MarkerTrackRow
                    markers={taskItemMarkers}
                    range={axis.range}
                    variant="task"
                    pluralNoun="tareas"
                    showLabels={!isFullPeriodView}
                    selected={selectedRelated}
                    onSelect={toggleSelection}
                  />
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
