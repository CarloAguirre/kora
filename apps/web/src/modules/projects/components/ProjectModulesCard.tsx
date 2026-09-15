import { useState } from 'react';
import {
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  PROJECT_MODULE_STAGES,
  PROJECT_MODULE_STAGE_LABELS,
  PROJECT_MODULE_TASK_SCOPES,
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUSES,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectModule,
  type ProjectModuleDelivery,
  type ProjectModuleDeliveryStatus,
  type ProjectModuleStage,
  type ProjectModuleTask,
  type ProjectModuleTaskStatus,
} from '@kora/contracts';
import styles from './ProjectModulesCard.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { useUpdateProjectModule, useUpdateProjectModuleDelivery, useUpdateProjectModuleTask } from '../api/projects.queries';
import { getTeamStyle } from '../utils/team-style';
import { ApiRequestError } from '@/shared/lib/api-client';

const STAGE_OPTIONS = PROJECT_MODULE_STAGES.map((stage) => ({ value: stage, label: PROJECT_MODULE_STAGE_LABELS[stage] }));
const TASK_STATUS_OPTIONS = PROJECT_MODULE_TASK_STATUSES.map((status) => ({
  value: status,
  label: PROJECT_MODULE_TASK_STATUS_LABELS[status],
}));
const DELIVERY_STATUS_OPTIONS = [
  { value: 'planned', label: PROJECT_MODULE_DELIVERY_STATUS_LABELS.planned },
  { value: 'delivered', label: PROJECT_MODULE_DELIVERY_STATUS_LABELS.delivered },
];
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
  if (delivery.status === 'delivered') return 'entregada';
  return parseDate(delivery.estimatedDate) < today() ? 'atrasada' : 'comprometida';
}

type TaskVisualStatus = 'done' | 'upcoming' | 'late';
function taskVisualStatus(task: ProjectModuleTask): TaskVisualStatus {
  if (task.status === 'done') return 'done';
  return parseDate(task.date) < today() ? 'late' : 'upcoming';
}

type PhaseVisualStatus = 'proximo' | 'en_proceso' | 'finalizado';
const PHASE_STATUS_LABELS: Record<PhaseVisualStatus, string> = {
  proximo: 'Próximo',
  en_proceso: 'En Proceso',
  finalizado: 'Finalizado',
};
const PHASE_STATUS_CHIP_CLASS: Record<PhaseVisualStatus, 'stageChipMuted' | 'stageChipInfo' | 'stageChipDone'> = {
  proximo: 'stageChipMuted',
  en_proceso: 'stageChipInfo',
  finalizado: 'stageChipDone',
};
/**
 * Estado visual de la fase, derivado de sus tareas (no de `currentStage`,
 * que es un campo aparte y manual). "Próximo": ninguna tarea empezó ni
 * vence hoy o antes. "Finalizado": todas las tareas ya vencieron y están
 * completadas. Cualquier otro caso: "En Proceso".
 */
function phaseVisualStatus(module: ProjectModule): PhaseVisualStatus {
  if (module.tasks.length === 0) return 'proximo';
  const allDonePast = module.tasks.every((t) => t.status === 'done' && parseDate(t.date) <= today());
  if (allDonePast) return 'finalizado';
  const anyStartedOrDue = module.tasks.some((t) => parseDate(t.startDate ?? t.date) <= today());
  return anyStartedOrDue ? 'en_proceso' : 'proximo';
}

interface DateRange {
  min: Date;
  max: Date;
}

/** Rango de fechas que cubre el módulo, para posicionar la línea de tiempo (tareas y entregas). Incluye siempre "hoy" para que la línea de HOY nunca quede fuera de vista. */
function computeModuleRange(module: ProjectModule): DateRange | null {
  const dates: Date[] = [today()];
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
  const DAY_MS = 24 * 60 * 60 * 1000;
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

interface ProjectModulesCardProps {
  projectId: string;
  modules: readonly ProjectModule[];
  canManage: boolean;
}

/**
 * "Fases · Módulos" — Roadmap de solo lectura de la estructura del proyecto
 * (fases y entregas): crear/quitar esa estructura vive en "Crear/editar
 * proyecto" (`EditProjectDialog`), no aquí. Las tareas (con su equipo, fechas
 * y ámbito) se crean desde la ficha del proyecto y son las que dibujan el
 * avance real de cada fase. Esta tarjeta solo visualiza (Gantt simple, con
 * zoom Semanas/Días y rango visible) y permite cambiar estado (etapa del
 * módulo, estado de tarea/entrega).
 */
export function ProjectModulesCard({ projectId, modules, canManage }: ProjectModulesCardProps) {
  const toast = useToast();
  const updateModule = useUpdateProjectModule();
  const updateTask = useUpdateProjectModuleTask();
  const updateDelivery = useUpdateProjectModuleDelivery();

  const [rangeDraft, setRangeDraft] = useState({ from: '', to: '' });
  const [appliedRange, setAppliedRange] = useState<DateRange | null>(null);
  const [zoomByModule, setZoomByModule] = useState<Record<string, number>>({});

  const onChangeStage = async (moduleId: string, currentStage: ProjectModuleStage) => {
    try {
      await updateModule.mutateAsync({ projectId, moduleId, input: { currentStage } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la etapa.');
    }
  };

  const onChangeTaskStatus = async (moduleId: string, taskId: string, status: ProjectModuleTaskStatus) => {
    try {
      await updateTask.mutateAsync({ projectId, moduleId, taskId, input: { status } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la tarea.');
    }
  };

  const onChangeDeliveryStatus = async (moduleId: string, deliveryId: string, status: ProjectModuleDeliveryStatus) => {
    try {
      await updateDelivery.mutateAsync({ projectId, moduleId, deliveryId, input: { status } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la entrega.');
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
          barras de cada fase se dibujan a partir de las tareas creadas.
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
                {module.blockerCount > 0 && (
                  <span className={styles.blockerBadge} title={`${module.blockerCount} registro(s) de horas con bloqueo reportado`}>
                    <AlertIcon size={12} /> {module.blockerCount} incidente{module.blockerCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className={styles.pipelineSection}>
                <span className={styles.pipelineLabel}>Resumen de avance</span>
                <div className={styles.pipeline}>
                  {PROJECT_MODULE_TASK_SCOPES.map((scope) => {
                    const scopeTasks = module.tasks.filter((t) => t.scope === scope);
                    const doneCount = scopeTasks.filter((t) => t.status === 'done').length;
                    const donePct = scopeTasks.length === 0 ? 100 : Math.round((doneCount / scopeTasks.length) * 100);
                    return (
                      <div
                        key={scope}
                        className={styles.pipelineSegment}
                        title={`${PROJECT_MODULE_TASK_SCOPE_LABELS[scope]}: ${donePct}% (${doneCount}/${scopeTasks.length} completadas)`}
                      >
                        <div className={styles.pipelineSegmentFill} style={{ width: `${donePct}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className={styles.pipelineLabels}>
                  {PROJECT_MODULE_TASK_SCOPES.map((scope) => (
                    <span key={scope}>{PROJECT_MODULE_TASK_SCOPE_LABELS[scope]}</span>
                  ))}
                </div>
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

              {range && (module.tasks.length > 0 || module.deliveries.length > 0) && (
                <div className={styles.timeline}>
                  <div className={styles.zoomRow}>
                    <span>Semanas</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={zoom}
                      onChange={(event) => setZoomByModule((prev) => ({ ...prev, [module.id]: Number(event.target.value) }))}
                    />
                    <span>Días</span>
                  </div>

                  <div className={styles.ganttGrid}>
                    <div className={styles.ganttLabels}>
                      <div className={styles.ganttHeader} />
                      {detail && <div className={styles.ganttDayRow} />}
                      {module.tasks.map((task) => {
                        const teamStyle = getTeamStyle(task.teamName ?? 'Sin equipo');
                        return (
                          <div key={task.id} className={styles.ganttRowLabel}>
                            <span className={styles.ganttRowDot} style={{ background: teamStyle.color }} />
                            <span className={styles.ganttRowLabelText}>
                              <span className={styles.ganttRowLabelTeam}>{task.teamName ?? 'Sin equipo'}</span>
                              <span className={styles.ganttRowLabelTask}>{task.name}</span>
                            </span>
                          </div>
                        );
                      })}
                      {module.deliveries.length > 0 && <div className={styles.ganttEntregasLabel}>Entregas</div>}
                    </div>

                    <div className={styles.ganttTracksCol}>
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

                      {weekGridlines(range).map((leftPct, gridIndex) => (
                        <div key={gridIndex} className={styles.timelineGridline} style={{ left: `${leftPct}%` }} />
                      ))}
                      {todayPct !== null && (
                        <div className={styles.timelineToday} style={{ left: `${todayPct}%` }} title="Hoy">
                          <span className={styles.timelineTodayPill}>HOY</span>
                        </div>
                      )}

                      {module.tasks.map((task) => {
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
                            <div key={task.id} className={styles.ganttTrackRow}>
                              <div className={styles.ganttTrackBg} />
                              <div
                                className={[styles.ganttBar, isFuture ? styles.ganttBarFuture : ''].filter(Boolean).join(' ')}
                                style={{ left: `${left}%`, width: `${width}%`, background: teamStyle.color }}
                                title={`${task.name}${task.teamName ? ` · ${task.teamName}` : ''} · ${formatDate(task.startDate)} a ${formatDate(task.date)}`}
                              >
                                {isDone ? '✓' : isCurrent ? 'En curso' : ''}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={task.id} className={styles.ganttTrackRow}>
                            <div className={styles.ganttTrackBg} />
                            <div
                              className={[styles.timelineMarker, styles.timelineMarkerTask, styles[`marker-${visual}`]]
                                .filter(Boolean)
                                .join(' ')}
                              style={{ left: `${pct(parseDate(task.date), range)}%` }}
                              title={`${task.name}${task.teamName ? ` · ${task.teamName}` : ''} · ${formatDate(task.date)}`}
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
                                className={[styles.timelineMarker, styles.timelineMarkerDelivery, styles[`marker-${visual}`]]
                                  .filter(Boolean)
                                  .join(' ')}
                                style={{ left: `${pct(parseDate(delivery.estimatedDate), range)}%` }}
                                title={`Entrega · ${formatDate(delivery.estimatedDate)} · ${PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {module.tasks.length > 0 && (
                <div className={styles.subsection}>
                  <span className={styles.subsectionLabel}>Tareas</span>
                  {module.tasks.map((task) => (
                    <div key={task.id} className={styles.taskRow}>
                      <span className={styles.taskName}>
                        {task.name}
                        {task.teamName && <span className={styles.segmentTeam}> · {task.teamName}</span>}
                        {task.assigneeName && <span className={styles.segmentTeam}> · {task.assigneeName}</span>}
                      </span>
                      <span className={styles.segmentDates}>{formatDate(task.date)}</span>
                      <Select
                        options={TASK_STATUS_OPTIONS}
                        value={task.status}
                        disabled={!canManage}
                        onChange={(event) =>
                          void onChangeTaskStatus(module.id, task.id, event.target.value as ProjectModuleTaskStatus)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {module.deliveries.length > 0 && (
                <div className={styles.deliveries}>
                  <span className={styles.deliveriesLabel}>Entregas estimadas</span>
                  {module.deliveries.map((delivery, deliveryIndex) => (
                    <div key={delivery.id} className={styles.deliveryRow}>
                      <span className={styles.deliveryLabel}>
                        Entrega {deliveryIndex + 1}
                        {delivery.teamName && <span className={styles.segmentTeam}> · {delivery.teamName}</span>}
                      </span>
                      <span>{formatDate(delivery.estimatedDate)}</span>
                      <Select
                        options={DELIVERY_STATUS_OPTIONS}
                        value={delivery.status}
                        disabled={!canManage}
                        onChange={(event) =>
                          void onChangeDeliveryStatus(module.id, delivery.id, event.target.value as ProjectModuleDeliveryStatus)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
