import { useRef, useState } from 'react';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_MODULE_TASK_SCOPES,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type HourEntrySummary,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleSegment,
  type ProjectModuleStage,
  type ProjectModuleTask,
  type ProjectObservation,
} from '@kora/contracts';
import styles from './ProjectModulesCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon, CloseIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useUpdateProjectModule } from '../api/projects.queries';
import { getTeamStyle } from '../utils/team-style';
import { ApiRequestError } from '@/shared/lib/api-client';

const STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formatDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—';
const parseDate = (value: string) => new Date(`${value}T00:00:00`);
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

type DeliveryVisualStatus = 'entregada' | 'comprometida' | 'atrasada';
function deliveryVisualStatus(delivery: ProjectModuleDelivery): DeliveryVisualStatus {
  // Una aprobada también se entregó — sin esto, pasada su fecha estimada se mostraba como atrasada.
  if (delivery.status === 'delivered' || delivery.status === 'approved') return 'entregada';
  return parseDate(delivery.estimatedDate) < today() ? 'atrasada' : 'comprometida';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Días corridos desde la fecha estimada hasta hoy — solo tiene sentido para una entrega 'atrasada'. */
const deliveryDelayDays = (delivery: ProjectModuleDelivery) =>
  Math.round((today().getTime() - parseDate(delivery.estimatedDate).getTime()) / DAY_MS);

type TaskVisualStatus = 'done' | 'upcoming' | 'late';
function taskVisualStatus(task: ProjectModuleTask): TaskVisualStatus {
  if (task.status === 'done') return 'done';
  return parseDate(task.date) < today() ? 'late' : 'upcoming';
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

/** Ícono/color del punto de "Registros de bitácora relacionados" — un dot sólido por tipo, igual criterio que `tipoMeta` del prototipo (ficha_proyecto_lider-actualizada.html). */
function observationDot(observation: ProjectObservation): { className: string | undefined; glyph: string } {
  switch (observation.type) {
    case 'hito':
      return { className: styles.regDotHito, glyph: '★' };
    case 'incidente':
      return observation.status === 'resuelto'
        ? { className: styles.regDotIncidentResolved, glyph: '✓' }
        : { className: styles.regDotIncidentOpen, glyph: '⚑' };
    case 'compromiso':
      return { className: styles.regDotCompromiso, glyph: '◆' };
    case 'atencion':
      return { className: styles.regDotAtencion, glyph: '⚠' };
    case 'cambio_proyecto':
      return { className: styles.regDotCambio, glyph: '➜' };
    default:
      return { className: styles.regDotObservacion, glyph: '✎' };
  }
}

/**
 * No existe un vínculo real (FK) entre una `ProjectObservation` y la tarea/entrega puntual que la
 * originó — solo con el módulo/fase completa. Mismo criterio pragmático que ya usa el Roadmap del
 * portal cliente (`project-detail.adapter.ts`/`PhaseRoadmap`): se cruza por texto, buscando la
 * etiqueta de la tarea/entrega dentro del título o mensaje del registro. Solo se devuelve el
 * registro más reciente, que refleja el estado actual del ítem.
 */
function relatedObservations(
  observations: readonly ProjectObservation[],
  moduleId: string,
  label: string,
): ProjectObservation[] {
  const needle = label.trim().toLowerCase();
  if (!needle) return [];
  return observations
    .filter(
      (observation) =>
        observation.moduleId === moduleId &&
        ((observation.title ?? '').toLowerCase().includes(needle) || observation.message.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 1);
}

function RelatedObservations({ observations, moduleId, label }: { observations: readonly ProjectObservation[]; moduleId: string; label: string }) {
  const matches = relatedObservations(observations, moduleId, label);
  return (
    <div className={styles.regPanel}>
      <p className={styles.regPanelHead}>Registros de bitácora relacionados</p>
      {matches.length === 0 ? (
        <p className={styles.regEmpty}>No hay registros de bitácora asociados a este ítem todavía.</p>
      ) : (
        matches.map((observation) => {
          const dot = observationDot(observation);
          return (
            <div key={observation.id} className={styles.regItem}>
              <span className={[styles.regDot, dot.className].filter(Boolean).join(' ')}>{dot.glyph}</span>
              <div className={styles.regItemBody}>
                <b>{observation.title || observation.message}</b>
                <span className={styles.regMeta}>
                  {formatDateTime(observation.createdAt)} · {observation.authorName}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

type GanttRowItem = { kind: 'segment'; segment: ProjectModuleSegment } | { kind: 'task'; task: ProjectModuleTask };

function ganttRowTeamName(item: GanttRowItem): string {
  return item.kind === 'segment' ? item.segment.teamName : (item.task.teamName ?? 'Sin equipo');
}

/**
 * Tramos y tareas del módulo, agrupados por equipo (mismo equipo = filas contiguas) — cada fila
 * sigue mostrando su propio punto y nombre de equipo, esto solo ordena las filas de un mismo
 * equipo una junto a otra en vez de intercalarlas con las de otros equipos.
 */
function groupedGanttItems(module: ProjectModule): GanttRowItem[] {
  const byTeam = new Map<string, GanttRowItem[]>();
  const teamOrder: string[] = [];
  const addItem = (teamName: string, item: GanttRowItem) => {
    if (!byTeam.has(teamName)) {
      byTeam.set(teamName, []);
      teamOrder.push(teamName);
    }
    byTeam.get(teamName)!.push(item);
  };
  module.segments.forEach((segment) => addItem(segment.teamName, { kind: 'segment', segment }));
  module.tasks.forEach((task) => addItem(task.teamName ?? 'Sin equipo', { kind: 'task', task }));
  return teamOrder.flatMap((teamName) => byTeam.get(teamName)!);
}

type PhaseVisualStatus = 'sin_plan' | 'proximo' | 'en_proceso' | 'finalizado';
const PHASE_STATUS_LABELS: Record<PhaseVisualStatus, string> = {
  sin_plan: 'Sin plan cargado',
  proximo: 'Próximo',
  en_proceso: 'En Proceso',
  finalizado: 'Finalizado',
};
const PHASE_STATUS_CHIP_CLASS: Record<PhaseVisualStatus, 'stageChipMuted' | 'stageChipInfo' | 'stageChipDone'> = {
  sin_plan: 'stageChipMuted',
  proximo: 'stageChipMuted',
  en_proceso: 'stageChipInfo',
  finalizado: 'stageChipDone',
};
/**
 * Estado visual de la fase. "Finalizado" es 100% la decisión manual del líder
 * (`currentStage === 'closed'`, el hito de cierre): si la cerró, quedó
 * cerrada, sin importar tareas pendientes — no se puede "reabrir" calculando
 * desde las tareas. El resto sí se deriva de las tareas: sin ninguna es
 * "Sin plan cargado"; "Próximo" es ninguna tarea empezada ni vencida hoy o
 * antes; cualquier otro caso (mientras no esté cerrada a mano) es "En Proceso".
 */
function phaseVisualStatus(module: ProjectModule): PhaseVisualStatus {
  if (module.currentStage === 'closed') return 'finalizado';
  if (module.tasks.length === 0) return 'sin_plan';
  const anyStartedOrDue = module.tasks.some((t) => parseDate(t.startDate ?? t.date) <= today());
  return anyStartedOrDue ? 'en_proceso' : 'proximo';
}

interface DateRange {
  min: Date;
  max: Date;
}

/** Rango de fechas que cubre el módulo, para posicionar la línea de tiempo (tramos, tareas y entregas). Incluye siempre "hoy" para que la línea de HOY nunca quede fuera de vista. */
function computeModuleRange(module: ProjectModule): DateRange | null {
  const dates: Date[] = [today()];
  module.segments.forEach((s) => {
    dates.push(parseDate(s.startDate));
    dates.push(parseDate(s.endDate));
  });
  module.tasks.forEach((t) => {
    dates.push(parseDate(t.date));
    if (t.startDate) dates.push(parseDate(t.startDate));
  });
  module.deliveries.forEach((d) => dates.push(parseDate(d.estimatedDate)));
  if (module.estimatedStartDate) dates.push(parseDate(module.estimatedStartDate));
  if (module.estimatedEndDate) dates.push(parseDate(module.estimatedEndDate));
  if (dates.length === 1) return null;

  let min = new Date(Math.min(...dates.map((d) => d.getTime())));
  let max = new Date(Math.max(...dates.map((d) => d.getTime())));
  if (min.getTime() === max.getTime()) {
    min.setDate(min.getDate() - 1);
    max.setDate(max.getDate() + 1);
  }
  // Margen a cada lado (como el scroll de 145% del ancho en el mockup): evita que "hoy" u otra
  // fecha caiga justo en el borde visible y choque con la primera/última etiqueta de mes.
  const pad = Math.max((max.getTime() - min.getTime()) * 0.12, 3 * DAY_MS);
  min = new Date(min.getTime() - pad);
  max = new Date(max.getTime() + pad);

  // Ventana mínima de ~15 días: con pocas fechas el Gantt no debe verse como una sola barra vacía.
  const MIN_SPAN_MS = 15 * DAY_MS;
  const span = max.getTime() - min.getTime();
  if (span < MIN_SPAN_MS) {
    const extra = (MIN_SPAN_MS - span) / 2;
    min = new Date(min.getTime() - extra);
    max = new Date(max.getTime() + extra);
  }
  return { min, max };
}

function pct(date: Date, range: DateRange): number {
  const total = range.max.getTime() - range.min.getTime();
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, ((date.getTime() - range.min.getTime()) / total) * 100));
}

/** Bloques de mes para la cabecera del Gantt — uno por cada mes que cruza el rango visible, recortado a los bordes del rango (igual que `renderMonthBlocks` del mockup). */
function monthTicks(range: DateRange): { leftPct: number; widthPct: number; label: string }[] {
  const ticks: { leftPct: number; widthPct: number; label: string }[] = [];
  const cursor = new Date(range.min.getFullYear(), range.min.getMonth(), 1);
  while (cursor <= range.max) {
    const start = cursor < range.min ? range.min : cursor;
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const end = next > range.max ? range.max : next;
    const left = pct(start, range);
    const width = pct(end, range) - left;
    ticks.push({ leftPct: left, widthPct: width, label: `${MONTH_LABELS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}` });
    cursor.setTime(next.getTime());
  }
  return ticks;
}

/** Etiquetas de día (cada 7 días) para el modo "detalle" del zoom Semanas/Días. */
function dayTicks(range: DateRange): { leftPct: number; label: string }[] {
  const ticks: { leftPct: number; label: string }[] = [];
  const cursor = new Date(range.min);
  let lastMonth = -1;
  while (cursor <= range.max) {
    const label = cursor.getMonth() !== lastMonth ? `${cursor.getDate()} ${MONTH_LABELS[cursor.getMonth()]}` : String(cursor.getDate());
    lastMonth = cursor.getMonth();
    ticks.push({ leftPct: pct(cursor, range), label });
    cursor.setDate(cursor.getDate() + 7);
  }
  return ticks;
}

/** Líneas verticales suaves cada 7 días, siempre visibles (independiente del zoom) — dan la cuadrícula de fondo del Gantt. */
function weekGridlines(range: DateRange): number[] {
  const lines: number[] = [];
  const cursor = new Date(range.min);
  while (cursor <= range.max) {
    lines.push(pct(cursor, range));
    cursor.setDate(cursor.getDate() + 7);
  }
  return lines;
}

/** Líneas verticales por día, solo en modo "detalle" del zoom — igual que `axis.dayLines` en `PhaseRoadmap`. */
function dayGridlines(range: DateRange): number[] {
  const lines: number[] = [];
  const cursor = new Date(range.min);
  while (cursor <= range.max) {
    lines.push(pct(cursor, range));
    cursor.setDate(cursor.getDate() + 1);
  }
  return lines;
}

/** El zoom pasa de "Semanas" a "Días" ensanchando la pista: 0 → 100% (cabe entera), 100 → 400% (igual que en `PhaseRoadmap`, vista cliente). */
const scrollWidthPercent = (zoom: number) => 100 + zoom * 3;

interface ProjectModulesCardProps {
  projectId: string;
  modules: readonly ProjectModule[];
  /** Registros de horas del proyecto (incluye `hasBlocker`/`blockerDescription`) — se filtran aquí por módulo para mostrar el detalle de los incidentes. */
  hourEntries: readonly HourEntrySummary[];
  /** Bitácora del proyecto — al seleccionar una tarea/entrega, se filtra por módulo + texto para mostrar sus "Registros de bitácora relacionados". */
  observations: readonly ProjectObservation[];
  canManage: boolean;
}

/**
 * "Fases · Módulos" — Roadmap de solo lectura del proyecto completo: crear/
 * quitar fases y entregas vive en "Crear/editar proyecto" (`EditProjectDialog`)
 * y las tareas se crean/gestionan (aprobar, rechazar, revertir) desde la
 * vista de líder de equipo (`TeamTasksCard`/`TeamDeliveriesCard`), no aquí.
 * Esta tarjeta solo visualiza (Gantt simple, con zoom Semanas/Días y rango
 * visible) y permite cambiar la etapa del módulo — el estado de cada
 * tarea/entrega se muestra como texto, sin poder editarlo.
 */
export function ProjectModulesCard({ projectId, modules, hourEntries, observations, canManage }: ProjectModulesCardProps) {
  const toast = useToast();
  const updateModule = useUpdateProjectModule();

  /**
   * La pista del Gantt es más ancha que la vista (zoom inicial = 145%), así que en una fase ya
   * avanzada HOY y las últimas tareas quedaban fuera de pantalla a la derecha. Al montar cada fase
   * se desplaza una sola vez para centrar HOY; después el scroll queda en manos de quien la mira.
   */
  const centeredOnToday = useRef(new Set<string>());
  const centerOnToday = (moduleId: string, todayPct: number | null) => (element: HTMLDivElement | null) => {
    if (!element || todayPct === null || centeredOnToday.current.has(moduleId)) return;
    centeredOnToday.current.add(moduleId);
    element.scrollLeft = Math.max(0, (element.scrollWidth * todayPct) / 100 - element.clientWidth / 2);
  };

  const [rangeDraft, setRangeDraft] = useState({ from: '', to: '' });
  const [appliedRange, setAppliedRange] = useState<DateRange | null>(null);
  const [zoomByModule, setZoomByModule] = useState<Record<string, number>>({});
  const [selectedTaskByModule, setSelectedTaskByModule] = useState<Record<string, string | null>>({});
  const [selectedDeliveryByModule, setSelectedDeliveryByModule] = useState<Record<string, string | null>>({});
  const [selectedSegmentByModule, setSelectedSegmentByModule] = useState<Record<string, string | null>>({});
  const [openIncidentsByModule, setOpenIncidentsByModule] = useState<Record<string, boolean>>({});

  const selectTask = (moduleId: string, taskId: string) => {
    setSelectedTaskByModule((prev) => ({ ...prev, [moduleId]: prev[moduleId] === taskId ? null : taskId }));
  };

  const selectDelivery = (moduleId: string, deliveryId: string) => {
    setSelectedDeliveryByModule((prev) => ({ ...prev, [moduleId]: prev[moduleId] === deliveryId ? null : deliveryId }));
  };

  const selectSegment = (moduleId: string, segmentId: string) => {
    setSelectedSegmentByModule((prev) => ({ ...prev, [moduleId]: prev[moduleId] === segmentId ? null : segmentId }));
  };

  const onChangeStage = async (moduleId: string, currentStage: ProjectModuleStage) => {
    try {
      await updateModule.mutateAsync({ projectId, moduleId, input: { currentStage } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la etapa.');
    }
  };

  const onApplyRange = () => {
    if (!rangeDraft.from || !rangeDraft.to) return;
    const min = parseDate(rangeDraft.from);
    const max = parseDate(rangeDraft.to);
    if (min >= max) return;
    setAppliedRange({ min, max });
  };

  const onResetRange = () => {
    setAppliedRange(null);
    setRangeDraft({ from: '', to: '' });
  };

  const totalDeliveries = modules.reduce((sum, m) => sum + m.deliveries.length, 0);
  const teamNames = [...new Set(modules.flatMap((m) => m.tasks.map((t) => t.teamName).filter((n): n is string => n != null)))];

  return (
    <Card>
      <div className={styles.header}>
        <p className={styles.title}>Fases · Módulos</p>
        <p className={styles.hint}>
          Roadmap del proyecto. La estructura (fases y entregas) se agrega/edita desde "Editar proyecto"; las
          barras de cada fase se dibujan a partir de las tareas creadas. La gestión de tareas y entregas
          (aprobar, rechazar, asignar) se hace desde la vista de líder de equipo.
        </p>
      </div>

      {modules.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryChip}>
              <b>{modules.length}</b> Fase{modules.length === 1 ? '' : 's'}
            </span>
            <span className={styles.summaryChip}>
              <b>{totalDeliveries}</b> entrega{totalDeliveries === 1 ? '' : 's'} planificada{totalDeliveries === 1 ? '' : 's'}
            </span>
          </div>

          <div className={styles.rangeRow}>
            <label className={styles.rangeLabel}>Rango visible:</label>
            <TextField
              className={styles.rangeDateField}
              type="date"
              value={rangeDraft.from}
              onChange={(event) => setRangeDraft((prev) => ({ ...prev, from: event.target.value }))}
            />
            <span>–</span>
            <TextField
              className={styles.rangeDateField}
              type="date"
              value={rangeDraft.to}
              onChange={(event) => setRangeDraft((prev) => ({ ...prev, to: event.target.value }))}
            />
            <Button type="button" variant="ghost" size="sm" onClick={onApplyRange} disabled={!rangeDraft.from || !rangeDraft.to}>
              Aplicar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onResetRange} disabled={!appliedRange}>
              Restablecer
            </Button>
          </div>
        </div>
      )}

      {modules.length > 0 && (
        <div className={styles.globalLegend}>
          {teamNames.map((teamName) => {
            const style = getTeamStyle(teamName);
            return (
              <span key={teamName} className={styles.legendItem}>
                <i className={styles.legendSquare} style={{ background: style.color, borderColor: style.color }} /> {teamName}
              </span>
            );
          })}
          <span className={styles.legendItem}>
            <i className={[styles.legendDiamond, styles['marker-entregada']].join(' ')} /> Entrega realizada
          </span>
          <span className={styles.legendItem}>
            <i className={[styles.legendDiamond, styles['marker-comprometida']].join(' ')} /> Entrega comprometida
          </span>
          <span className={styles.legendItem}>
            <i className={[styles.legendDiamond, styles['marker-atrasada']].join(' ')} /> Entrega atrasada
          </span>
          <span className={styles.legendItem}>
            <i className={[styles.legendDot, styles['marker-done']].join(' ')} /> Tarea terminada
          </span>
          <span className={styles.legendItem}>
            <i className={[styles.legendDot, styles['marker-upcoming']].join(' ')} /> Tarea próxima
          </span>
          <span className={styles.legendItem}>
            <i className={[styles.legendDot, styles['marker-late']].join(' ')} /> Tarea atrasada
          </span>
          <span className={styles.legendItem}>
            <i className={styles.legendLine} /> Hoy
          </span>
          <span className={styles.legendHint}>Usa el zoom de cada fase para ver días y tareas.</span>
        </div>
      )}

      {modules.length === 0 && <p className={styles.empty}>Aún no hay módulos.</p>}

      <div className={styles.list}>
        {modules.map((module, index) => {
          const range = appliedRange ?? computeModuleRange(module);
          const todayPct = range ? pct(today(), range) : null;
          const zoom = zoomByModule[module.id] ?? 15;
          const detail = zoom > 50;
          const phaseStatus = phaseVisualStatus(module);
          const selectedTaskId = selectedTaskByModule[module.id] ?? null;
          const selectedDeliveryId = selectedDeliveryByModule[module.id] ?? null;
          const selectedSegmentId = selectedSegmentByModule[module.id] ?? null;
          const ganttItems = groupedGanttItems(module);
          const incidentsOpen = openIncidentsByModule[module.id] ?? false;
          const moduleIncidents = hourEntries.filter((entry) => entry.hasBlocker && entry.module?.id === module.id);
          // Mismo criterio que el flag "⚑ N atrasos" del prototipo (ficha_proyecto_lider-actualizada.html).
          const lateDeliveryCount = module.deliveries.filter((d) => deliveryVisualStatus(d) === 'atrasada').length;

          return (
            <div key={module.id} className={styles.moduleCard}>
              <div className={styles.moduleHead}>
                <div className={styles.moduleHeadLeft}>
                  <span className={styles.moduleIndex}>Fase {index + 1}</span>
                  <p className={styles.moduleName}>{module.name}</p>
                  <span className={[styles.stageChip, styles[PHASE_STATUS_CHIP_CLASS[phaseStatus]]].join(' ')}>
                    {PHASE_STATUS_LABELS[phaseStatus]}
                  </span>
                </div>
                {(module.blockerCount > 0 || lateDeliveryCount > 0) && (
                  <div className={styles.moduleFlags}>
                    {module.blockerCount > 0 && (
                      <button
                        type="button"
                        className={styles.blockerBadge}
                        aria-expanded={incidentsOpen}
                        onClick={() => setOpenIncidentsByModule((prev) => ({ ...prev, [module.id]: !incidentsOpen }))}
                        title={`${module.blockerCount} registro(s) de horas con bloqueo reportado`}
                      >
                        <AlertIcon size={12} /> {module.blockerCount} incidente{module.blockerCount > 1 ? 's' : ''}
                      </button>
                    )}
                    {lateDeliveryCount > 0 && (
                      <span
                        className={styles.lateBadge}
                        title={`${lateDeliveryCount} entrega(s) con fecha estimada vencida y sin entregar`}
                      >
                        ⚑ {lateDeliveryCount} atraso{lateDeliveryCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {incidentsOpen && module.blockerCount > 0 && (
                <div className={styles.incidentsPanel}>
                  <span className={styles.subsectionLabel}>Incidentes</span>
                  {moduleIncidents.length === 0 && (
                    <p className={styles.incidentsEmpty}>
                      No se encontraron detalles de estos incidentes en los registros de horas recientes.
                    </p>
                  )}
                  {moduleIncidents.map((entry) => (
                    <div key={entry.id} className={styles.incidentRow}>
                      <span className={styles.incidentMeta}>
                        {formatDate(entry.date)} · {entry.user.fullName}
                        {entry.team?.name ? ` · ${entry.team.name}` : ''}
                      </span>
                      <span className={styles.incidentDescription}>{entry.blockerDescription || 'Sin detalle'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Avance real por ámbito, ponderado por HH (`module.progress`, calculado en el backend). Un
                  ámbito sin tareas es "Sin plan", nunca 0% ni 100%. */}
              <div className={styles.pipelineSection}>
                <div className={styles.pipelineHeader}>
                  <span className={styles.pipelineLabel}>Resumen de avance</span>
                  <span className={styles.pipelineTotals}>
                    {module.progress.actual != null
                      ? `Avance ${module.progress.actual}% · Esperado ${module.progress.expected ?? 0}%`
                      : 'Sin plan cargado'}
                  </span>
                </div>
                <div className={styles.pipeline}>
                  {PROJECT_MODULE_TASK_SCOPES.map((scope) => {
                    const scopePct = module.progress.scopes[scope];
                    const scopeTasks = module.tasks.filter((t) => t.scope === scope);
                    const approvedCount = scopeTasks.filter((t) => t.status === 'done').length;
                    return (
                      <div
                        key={scope}
                        className={styles.pipelineColumn}
                        title={
                          scopePct != null
                            ? `${PROJECT_MODULE_TASK_SCOPE_LABELS[scope]}: ${scopePct}% (${approvedCount}/${scopeTasks.length} aprobadas)`
                            : `${PROJECT_MODULE_TASK_SCOPE_LABELS[scope]}: sin tareas cargadas`
                        }
                      >
                        <div className={styles.pipelineSegment}>
                          <div className={styles.pipelineSegmentFill} style={{ width: `${scopePct ?? 0}%` }} />
                        </div>
                        <span className={styles.pipelineScopeLabel}>
                          {PROJECT_MODULE_TASK_SCOPE_LABELS[scope]}
                          <span className={scopePct != null ? styles.pipelineScopeValue : styles.pipelineScopeEmpty}>
                            {scopePct != null ? `${scopePct}%` : 'Sin plan'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {module.progress.estimatedByCount && (
                  <span className={styles.pipelineHint}>Avance calculado por cantidad de tareas: ninguna tiene HH estimadas.</span>
                )}
              </div>

              <div className={styles.moduleFields}>
                <Select
                  className={styles.moduleStageField}
                  label="Etapa actual"
                  options={STAGE_OPTIONS}
                  value={module.currentStage}
                  disabled={!canManage}
                  onChange={(event) => void onChangeStage(module.id, event.target.value as ProjectModuleStage)}
                />
                <span className={styles.moduleMeta}>
                  <b className={styles.moduleMetaLabel}>Etapa inicial</b>
                  {PROJECT_MODULE_STAGE_LABELS[module.initialStage]}
                </span>
                <span className={styles.moduleMeta}>
                  <b className={styles.moduleMetaLabel}>Horas estimadas</b>
                  {module.estimatedHours != null ? `${module.estimatedHours} hh` : 'Sin definir'}
                </span>
                <span className={styles.moduleMeta}>
                  <b className={styles.moduleMetaLabel}>Fechas estimadas</b>
                  {formatDate(module.estimatedStartDate)} — {formatDate(module.estimatedEndDate)}
                </span>
              </div>

              {range && (module.segments.length > 0 || module.tasks.length > 0 || module.deliveries.length > 0) && (
                <div className={styles.timeline}>
                  <div className={styles.zoomRow}>
                    <span>Semanas</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={zoom}
                      onChange={(event) => setZoomByModule((prev) => ({ ...prev, [module.id]: Number(event.target.value) }))}
                      aria-label="Zoom del cronograma: de vista por semanas a vista por días"
                    />
                    <span>Días</span>
                  </div>

                  <div className={styles.ganttGrid}>
                    <div className={styles.ganttLabels}>
                      <div className={styles.ganttHeader} />
                      {detail && <div className={styles.ganttDayRow} />}
                      {ganttItems.map((item) => {
                        const teamName = ganttRowTeamName(item);
                        const teamStyle = getTeamStyle(teamName);
                        const label = item.kind === 'segment' ? item.segment.name : item.task.name;
                        const key = item.kind === 'segment' ? `segment-${item.segment.id}` : `task-${item.task.id}`;
                        return (
                          <div key={key} className={styles.ganttRowLabel}>
                            <span className={styles.ganttRowDot} style={{ background: teamStyle.color }} />
                            <span className={styles.ganttRowLabelText}>
                              <span className={styles.ganttRowLabelTeam}>{teamName}</span>
                              <span className={styles.ganttRowLabelTask}>{label}</span>
                            </span>
                          </div>
                        );
                      })}
                      {module.deliveries.length > 0 && <div className={styles.ganttEntregasLabel}>Entregas</div>}
                    </div>

                    <div className={styles.ganttTracksCol} ref={centerOnToday(module.id, todayPct)}>
                      <div className={styles.ganttScroll} style={{ width: `${scrollWidthPercent(zoom)}%` }}>
                        <div className={styles.ganttHeader}>
                          {monthTicks(range).map((tick, tickIndex) => (
                            <span
                              key={`${tick.label}-${tickIndex}`}
                              className={styles.ganttMonthTick}
                              style={{ left: `${tick.leftPct}%`, width: `${tick.widthPct}%` }}
                            >
                              {tick.label}
                            </span>
                          ))}
                        </div>
                        {detail && (
                          <div className={styles.ganttDayRow}>
                            {dayTicks(range).map((tick, tickIndex) => (
                              <span key={`${tick.label}-${tickIndex}`} className={styles.ganttDayTick} style={{ left: `${tick.leftPct}%` }}>
                                {tick.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {detail &&
                          dayGridlines(range).map((leftPct, gridIndex) => (
                            <div key={`day-${gridIndex}`} className={styles.ganttDayLine} style={{ left: `${leftPct}%` }} />
                          ))}
                        {weekGridlines(range).map((leftPct, gridIndex) => (
                          <div key={gridIndex} className={styles.timelineGridline} style={{ left: `${leftPct}%` }} />
                        ))}
                        {todayPct !== null && (
                          <div className={styles.timelineToday} style={{ left: `${todayPct}%` }} title="Hoy">
                            <span className={styles.timelineTodayPill}>HOY</span>
                          </div>
                        )}

                        {ganttItems.map((item) => {
                          if (item.kind === 'segment') {
                            const { segment } = item;
                            const teamStyle = getTeamStyle(segment.teamName);
                            const left = pct(parseDate(segment.startDate), range);
                            const width = Math.max(pct(parseDate(segment.endDate), range) - left, 1.5);
                            const startDate = parseDate(segment.startDate);
                            const endDate = parseDate(segment.endDate);
                            const isDone = endDate < today();
                            const isCurrent = !isDone && startDate <= today() && today() <= endDate;
                            const isFuture = !isDone && startDate > today();
                            return (
                              <div key={`segment-${segment.id}`} className={styles.ganttTrackRow}>
                                <div className={styles.ganttTrackBg} />
                                <div
                                  className={[
                                    styles.ganttBar,
                                    isFuture ? styles.ganttBarFuture : '',
                                    selectedSegmentId === segment.id ? styles.ganttBarSelected : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  style={{ left: `${left}%`, width: `${width}%`, background: teamStyle.color }}
                                  title={`${segment.teamName} — ${segment.name} · ${formatDate(segment.startDate)} a ${formatDate(segment.endDate)}`}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={selectedSegmentId === segment.id}
                                  onClick={() => selectSegment(module.id, segment.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      selectSegment(module.id, segment.id);
                                    }
                                  }}
                                >
                                  {isDone ? '✓' : isCurrent ? 'En curso' : ''}
                                </div>
                              </div>
                            );
                          }

                          const { task } = item;
                          const teamStyle = getTeamStyle(task.teamName ?? 'Sin equipo');
                          const visual = taskVisualStatus(task);
                          if (task.startDate) {
                            const left = pct(parseDate(task.startDate), range);
                            const width = Math.max(pct(parseDate(task.date), range) - left, 1.5);
                            const startDate = parseDate(task.startDate);
                            const isDone = task.status === 'done';
                            const isCurrent = !isDone && startDate <= today() && today() <= parseDate(task.date);
                            const isFuture = !isDone && startDate > today();
                            return (
                              <div key={`task-${task.id}`} className={styles.ganttTrackRow}>
                                <div className={styles.ganttTrackBg} />
                                <div
                                  className={[
                                    styles.ganttBar,
                                    isFuture ? styles.ganttBarFuture : '',
                                    selectedTaskId === task.id ? styles.ganttBarSelected : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  style={{ left: `${left}%`, width: `${width}%`, background: teamStyle.color }}
                                  title={`${task.name}${task.teamName ? ` · ${task.teamName}` : ''} · ${formatDate(task.startDate)} a ${formatDate(task.date)}`}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={selectedTaskId === task.id}
                                  onClick={() => selectTask(module.id, task.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      selectTask(module.id, task.id);
                                    }
                                  }}
                                >
                                  {isDone ? '✓' : isCurrent ? 'En curso' : ''}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={`task-${task.id}`} className={styles.ganttTrackRow}>
                              <div className={styles.ganttTrackBg} />
                              <div
                                className={[
                                  styles.timelineMarker,
                                  styles.timelineMarkerTask,
                                  styles[`marker-${visual}`],
                                  selectedTaskId === task.id ? styles.timelineMarkerSelected : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                style={{ left: `${pct(parseDate(task.date), range)}%` }}
                                title={`${task.name}${task.teamName ? ` · ${task.teamName}` : ''} · ${formatDate(task.date)}`}
                                role="button"
                                tabIndex={0}
                                aria-pressed={selectedTaskId === task.id}
                                onClick={() => selectTask(module.id, task.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    selectTask(module.id, task.id);
                                  }
                                }}
                              />
                            </div>
                          );
                        })}

                        {module.deliveries.length > 0 && (
                          <div className={styles.ganttTrackRow}>
                            <div className={styles.ganttTrackBg} />
                            {module.deliveries.map((delivery) => {
                              const visual = deliveryVisualStatus(delivery);
                              return (
                                <div
                                  key={delivery.id}
                                  className={[
                                    styles.timelineMarker,
                                    styles.timelineMarkerDelivery,
                                    styles[`marker-${visual}`],
                                    selectedDeliveryId === delivery.id ? styles.timelineMarkerSelected : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  style={{ left: `${pct(parseDate(delivery.estimatedDate), range)}%` }}
                                  title={`${delivery.name ?? 'Entrega'} · ${formatDate(delivery.estimatedDate)} · ${PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}`}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={selectedDeliveryId === delivery.id}
                                  onClick={() => selectDelivery(module.id, delivery.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      selectDelivery(module.id, delivery.id);
                                    }
                                  }}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedTaskId &&
                (() => {
                  const task = module.tasks.find((t) => t.id === selectedTaskId);
                  if (!task) return null;
                  return (
                    <div className={styles.subsection}>
                      <div className={styles.taskDetailHead}>
                        <span className={styles.subsectionLabel}>
                          {task.name}
                          {task.teamName && <span className={styles.segmentTeam}> · {task.teamName}</span>}
                          {task.assigneeName && <span className={styles.segmentTeam}> · {task.assigneeName}</span>}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => selectTask(module.id, task.id)}
                          aria-label="Cerrar detalle de la tarea"
                        >
                          <CloseIcon size={14} />
                        </Button>
                      </div>
                      <div className={styles.taskDetail}>
                        <DetailField label="Estado" value={PROJECT_MODULE_TASK_STATUS_LABELS[task.status]} />
                        <DetailField label="Ámbito" value={PROJECT_MODULE_TASK_SCOPE_LABELS[task.scope]} />
                        <DetailField label="Fecha límite" value={formatDate(task.date)} />
                        <DetailField label="Horas estimadas" value={task.estimatedHours != null ? `${task.estimatedHours} hh` : 'Sin definir'} />
                        <DetailField label="Fecha de inicio" value={formatDate(task.startDate)} />
                        <DetailField
                          label="Completada"
                          value={task.completedAt ? new Date(task.completedAt).toLocaleString('es-CL') : 'Aún no'}
                        />
                        <DetailField label="Descripción" value={task.description || 'Sin descripción'} full />
                      </div>
                      <RelatedObservations observations={observations} moduleId={module.id} label={task.name} />
                    </div>
                  );
                })()}

              {selectedDeliveryId &&
                (() => {
                  const delivery = module.deliveries.find((d) => d.id === selectedDeliveryId);
                  if (!delivery) return null;
                  return (
                    <div className={styles.deliveries}>
                      <div className={styles.taskDetailHead}>
                        <span className={styles.deliveriesLabel}>
                          {delivery.name ?? 'Entrega'}
                          {delivery.teamName && <span className={styles.segmentTeam}> · {delivery.teamName}</span>}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => selectDelivery(module.id, delivery.id)}
                          aria-label="Cerrar detalle de la entrega"
                        >
                          <CloseIcon size={14} />
                        </Button>
                      </div>
                      <div className={styles.taskDetail}>
                        <DetailField label="Estado" value={PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]} />
                        <DetailField label="Fecha estimada" value={formatDate(delivery.estimatedDate)} />
                        {deliveryVisualStatus(delivery) === 'atrasada' && (
                          <DetailField
                            label="Atraso"
                            value={`${deliveryDelayDays(delivery)} día${deliveryDelayDays(delivery) === 1 ? '' : 's'}`}
                            danger
                          />
                        )}
                        <DetailField label="Equipo" value={delivery.teamName ?? 'Sin equipo'} />
                        <DetailField label="Descripción" value={delivery.description || 'Sin descripción'} full />
                      </div>
                      <RelatedObservations
                        observations={observations}
                        moduleId={module.id}
                        label={delivery.name ?? (delivery.teamName ? `Entrega ${delivery.teamName}` : 'Entrega')}
                      />
                    </div>
                  );
                })()}

              {selectedSegmentId &&
                (() => {
                  const segment = module.segments.find((s) => s.id === selectedSegmentId);
                  if (!segment) return null;
                  return (
                    <div className={styles.subsection}>
                      <div className={styles.taskDetailHead}>
                        <span className={styles.subsectionLabel}>
                          {segment.teamName}
                          <span className={styles.segmentTeam}> — {segment.name}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => selectSegment(module.id, segment.id)}
                          aria-label="Cerrar detalle del tiempo de ejecución"
                        >
                          <CloseIcon size={14} />
                        </Button>
                      </div>
                      <div className={styles.taskDetail}>
                        <DetailField label="Equipo" value={segment.teamName} />
                        <DetailField label="Fecha de inicio" value={formatDate(segment.startDate)} />
                        <DetailField label="Fecha de término" value={formatDate(segment.endDate)} />
                      </div>
                    </div>
                  );
                })()}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DetailField({ label, value, full, danger }: { label: string; value: string; full?: boolean; danger?: boolean }) {
  return (
    <div className={[styles.taskDetailField, full ? styles.taskDetailFieldFull : ''].filter(Boolean).join(' ')}>
      <span className={styles.taskDetailLabel}>{label}</span>
      <span className={[styles.taskDetailValue, danger ? styles.taskDetailValueDanger : ''].filter(Boolean).join(' ')}>{value}</span>
    </div>
  );
}
