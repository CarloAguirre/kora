import { useEffect, useState } from 'react';
import {
  FORECAST_ASSIGNMENT_TYPES,
  FORECAST_ASSIGNMENT_TYPE_LABELS,
  FORECAST_TYPES_WITH_PROJECT,
  type ForecastAssignment,
  type ForecastAssignmentType,
  type ForecastContainedTask,
  type ForecastDeliveryMark,
  type ForecastUnscheduledHours,
} from '@kora/contracts';
import styles from './ForecastMemberEditor.module.css';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { CloseIcon, DiamondIcon, PlusIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import {
  useCreateForecastAssignment,
  useKeepForecastAdjustment,
  useRemoveForecastAssignment,
  useResetForecastAssignment,
  useUpdateForecastAssignment,
} from '../api/forecast.queries';
import { formatWeekday } from '../lib/labor-weeks';
import { formatHours as formatNumber } from '../lib/hours-format';

const TYPE_OPTIONS = FORECAST_ASSIGNMENT_TYPES.map((type) => ({ value: type, label: FORECAST_ASSIGNMENT_TYPE_LABELS[type] }));

/** Las mutaciones de este editor no invalidan en error: sin esto, un guardado que falla (permiso,
 * red, validación) queda en silencio total y parece que sí se guardó. */
function onMutationError(toast: ReturnType<typeof useToast>, fallback: string) {
  return (cause: unknown) => toast.error(cause instanceof ApiRequestError ? cause.payload.message : fallback);
}

export interface ForecastMemberEditorMember {
  readonly teamMemberId: string;
  readonly capacityHours: number;
  readonly assignedHours: number;
  readonly deliveries: readonly ForecastDeliveryMark[];
  readonly containedTasks: readonly ForecastContainedTask[];
  readonly unscheduled: readonly ForecastUnscheduledHours[];
}

/**
 * HH de cada fila manual de proyecto que ya cubren los tramos/tareas del mismo proyecto esa semana —
 * no suman aparte (mismo reparto que `coverPlannedHours` en la API).
 */
function coveredHoursById(calculated: readonly ForecastAssignment[], manual: readonly ForecastAssignment[]): Map<string, number> {
  const pending = new Map<string, number>();
  for (const assignment of calculated) {
    if (assignment.project) pending.set(assignment.project.id, (pending.get(assignment.project.id) ?? 0) + assignment.assignedHours);
  }
  const result = new Map<string, number>();
  for (const assignment of manual) {
    const projectId = assignment.project?.id;
    if (!projectId || (assignment.type !== 'project' && assignment.type !== 'support')) continue;
    const taken = Math.min(pending.get(projectId) ?? 0, assignment.assignedHours);
    if (taken <= 0) continue;
    pending.set(projectId, (pending.get(projectId) ?? 0) - taken);
    result.set(assignment.id, taken);
  }
  return result;
}

function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function formatHours(hours: number): string {
  return `${formatNumber(hours)} h`;
}

/**
 * Editor de las asignaciones de un colaborador en el período — lo que en la v1
 * (`LiderEquipoForecast`) se abría al expandir su tarjeta. En la v2 vive dentro
 * del modal "Editar" de la tabla de Forecast.
 *
 * Arriba lo calculado desde los proyectos (tramos y tareas, más las tareas que ya cubre un tramo y
 * las entregas de la semana); abajo lo que el líder carga a mano. Ver docs/DECISION-M6-FORECAST.md,
 * "Forecast calculado".
 */
export function ForecastMemberEditor({
  member,
  assignments,
  periodStart,
  periodEnd,
}: {
  member: ForecastMemberEditorMember;
  assignments: ForecastAssignment[];
  periodStart: string;
  periodEnd: string;
}) {
  const toast = useToast();
  const createAssignment = useCreateForecastAssignment();
  const remaining = Math.max(0, member.capacityHours - member.assignedHours);
  const calculated = assignments.filter((assignment) => assignment.source !== 'manual');
  const manual = assignments.filter((assignment) => assignment.source === 'manual');
  const covered = coveredHoursById(calculated, manual);
  const hasProjectData = calculated.length > 0 || member.containedTasks.length > 0 || member.deliveries.length > 0;
  const overHours = member.assignedHours - member.capacityHours;

  return (
    <div className={styles.editor}>
      {overHours > 0 && (
        <div className={styles.overloadBox} role="alert">
          <TriangleAlertIcon size={16} />
          <span>
            Esta semana queda en <strong>{Math.round((member.assignedHours / member.capacityHours) * 100)} %</strong>:{' '}
            {formatHours(member.assignedHours)} de {formatHours(member.capacityHours)}, {formatHours(overHours)} sobre su capacidad.
            Revisa las horas de proyecto o las ausencias.
          </span>
        </div>
      )}
      <section className={styles.group}>
        <h4 className={styles.groupTitle}>Calculado desde proyectos</h4>
        {hasProjectData ? (
          <div className={styles.rows}>
            {calculated.map((assignment) => (
              <CalculatedAssignmentRow key={assignment.id} assignment={assignment} maxHours={member.capacityHours} />
            ))}
            {member.containedTasks.map((task) => (
              <div key={task.id} className={styles.infoRow}>
                <div className={styles.infoTitle}>
                  Tarea “{task.name}” <Badge tone="info">Incluida en el tramo</Badge>
                </div>
                <span className={styles.infoMeta}>
                  {task.projectName} · {task.moduleName} · {formatDay(task.startDate)} al {formatDay(task.date)} ·{' '}
                  {formatHours(task.estimatedHours)} estimadas, no suman
                </span>
              </div>
            ))}
            {member.deliveries.map((delivery) => (
              <div key={delivery.id} className={styles.infoRow}>
                <div className={styles.infoTitle}>
                  <DiamondIcon size={14} /> Entrega “{delivery.name}”
                </div>
                <span className={styles.infoMeta}>
                  {delivery.projectName} · {delivery.moduleName} · {formatWeekday(delivery.date)} · sin horas
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            Esta semana no hay tramos ni tareas con horas para esta persona. Se llena solo al asignarla en el Roadmap de un proyecto.
          </p>
        )}
      </section>

      {member.unscheduled.length > 0 && (
        <section className={styles.group}>
          <h4 className={styles.groupTitle}>Horas sin semana asignada</h4>
          <p className={styles.empty}>
            Total del proyecto, no de esta semana: están asignadas a la persona en el equipo del proyecto, pero ningún tramo del
            roadmap ni tarea las pone todavía en una semana. Para planificarlas, dales fecha en el proyecto.
          </p>
          <div className={styles.rows}>
            {member.unscheduled.map((row) => (
              <div key={row.projectId} className={styles.infoRow}>
                <div className={styles.infoTitle}>
                  {row.projectName} · {formatHours(row.assignedHours - row.plannedHours)} h sin semana asignada
                </div>
                <span className={styles.infoMeta}>
                  {formatHours(row.assignedHours)} asignadas · {formatHours(row.plannedHours)} en el Forecast
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.group}>
        <h4 className={styles.groupTitle}>Ausencias y otras actividades</h4>
        {manual.length > 0 && (
          <div className={styles.rows}>
            {manual.map((assignment) => (
              <ManualAssignmentRow
                key={assignment.id}
                assignment={assignment}
                maxHours={member.capacityHours}
                coveredHours={covered.get(assignment.id) ?? 0}
              />
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className={styles.addRow}
          iconLeft={<PlusIcon size={16} />}
          loading={createAssignment.isPending}
          onClick={() =>
            createAssignment.mutate(
              {
                teamMemberId: member.teamMemberId,
                periodStart,
                periodEnd,
                type: 'other',
                assignedHours: 0,
              },
              { onError: onMutationError(toast, 'No se pudo agregar la fila.') },
            )
          }
        >
          Agregar ausencia o actividad
        </Button>
      </section>

      {remaining > 0 && (
        <div className={styles.unassignedRow}>
          <span>Sin asignación</span>
          <span>{remaining}h</span>
        </div>
      )}
    </div>
  );
}

function sourceLabel(assignment: ForecastAssignment): string {
  if (assignment.segment) return `Roadmap · ${assignment.segment.moduleName} · ${assignment.segment.name}`;
  if (assignment.task) return `Tarea · ${assignment.task.name}`;
  return 'Calculado';
}

/** Fila calculada: solo se editan HH (eso la deja ajustada) y comentarios. */
function CalculatedAssignmentRow({ assignment, maxHours }: { assignment: ForecastAssignment; maxHours: number }) {
  const toast = useToast();
  const updateAssignment = useUpdateForecastAssignment();
  const resetAssignment = useResetForecastAssignment();
  const keepAdjustment = useKeepForecastAdjustment();
  const [comments, setComments] = useState(assignment.comments);
  const [hours, setHours] = useState(String(assignment.assignedHours));
  const calculatedHours = assignment.calculatedHours ?? 0;

  // "Volver al cálculo" o un recálculo cambian las HH en el servidor: el campo las sigue.
  useEffect(() => setHours(String(assignment.assignedHours)), [assignment.assignedHours]);
  useEffect(() => setComments(assignment.comments), [assignment.comments]);

  const commit = (patch: { comments?: string; assignedHours?: number }) =>
    updateAssignment.mutate(
      {
        assignmentId: assignment.id,
        input: { comments: patch.comments ?? comments, assignedHours: patch.assignedHours ?? Number(hours) },
      },
      { onError: onMutationError(toast, 'No se pudo guardar el cambio.') },
    );

  const rowClass = [styles.calculatedRow, assignment.isStale ? styles.staleRow : assignment.adjusted ? styles.adjustedRow : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass}>
      <div className={styles.calculatedHead}>
        <span className={styles.calculatedTitle}>{assignment.project?.name ?? 'Proyecto'}</span>
        <Badge tone="success">{sourceLabel(assignment)}</Badge>
        {assignment.adjusted && !assignment.isStale && <Badge tone="warning">Ajustado</Badge>}
        {assignment.isStale && <Badge tone="danger">Desfasado</Badge>}
      </div>

      {assignment.isStale && (
        <div className={styles.staleBox} role="alert">
          <TriangleAlertIcon size={16} />
          <span>
            El proyecto cambió después de tu ajuste: el cálculo ahora da <strong>{formatHours(calculatedHours)}</strong> y tu ajuste
            es <strong>{formatHours(assignment.assignedHours)}</strong>.
          </span>
          <div className={styles.staleActions}>
            <Button
              variant="outline"
              size="sm"
              loading={keepAdjustment.isPending}
              onClick={() =>
                keepAdjustment.mutate(assignment.id, { onError: onMutationError(toast, 'No se pudo mantener el ajuste.') })
              }
            >
              Mantener {formatHours(assignment.assignedHours)}
            </Button>
            <Button
              size="sm"
              loading={resetAssignment.isPending}
              onClick={() => resetAssignment.mutate(assignment.id, { onError: onMutationError(toast, 'No se pudo usar el cálculo.') })}
            >
              Usar el cálculo ({formatHours(calculatedHours)})
            </Button>
          </div>
        </div>
      )}

      <div className={styles.calculatedFields}>
        <TextField
          label="Comentarios"
          placeholder="Por qué se ajusta, si aplica"
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          onBlur={() => {
            if (comments !== assignment.comments) commit({ comments });
          }}
        />
        <TextField
          label="HH"
          type="number"
          min={0}
          max={maxHours}
          step="0.5"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          onBlur={() => {
            const next = Number(hours) || 0;
            if (next !== assignment.assignedHours) commit({ assignedHours: next });
          }}
        />
        <span className={styles.calculatedValue}>
          Calculado
          <strong>{formatHours(calculatedHours)}</strong>
        </span>
      </div>

      {assignment.adjusted && !assignment.isStale && (
        <div className={styles.adjustedFoot}>
          <span>
            Ajustado{assignment.adjusted.byName ? ` por ${assignment.adjusted.byName}` : ''} el{' '}
            {formatDay(assignment.adjusted.at.slice(0, 10))}
          </span>
          <Button
            variant="ghost"
            size="sm"
            loading={resetAssignment.isPending}
            onClick={() => resetAssignment.mutate(assignment.id, { onError: onMutationError(toast, 'No se pudo volver al cálculo.') })}
          >
            Volver al cálculo ({formatHours(calculatedHours)})
          </Button>
        </div>
      )}
    </div>
  );
}

function ManualAssignmentRow({
  assignment,
  maxHours,
  coveredHours,
}: {
  assignment: ForecastAssignment;
  maxHours: number;
  /** HH de esta fila que ya cubren tramos/tareas del mismo proyecto: no suman aparte. */
  coveredHours: number;
}) {
  const toast = useToast();
  const updateAssignment = useUpdateForecastAssignment();
  const removeAssignment = useRemoveForecastAssignment();
  const [comments, setComments] = useState(assignment.comments);
  const [hours, setHours] = useState(String(assignment.assignedHours));
  // Tipo/cliente/proyecto también viven en estado local, igual que comentarios y HH: `commit` encadena
  // varios guardados sueltos (uno por campo que se toca) y si cada uno usara `assignment` como base para
  // los campos que no cambia, un guardado que vuelve antes que otro puede pisarlo con un valor viejo.
  const [type, setType] = useState(assignment.type);
  const [clientId, setClientId] = useState(assignment.client?.id ?? null);
  const [projectId, setProjectId] = useState(assignment.project?.id ?? null);

  // El servidor puede traer una versión más nueva (otra pestaña, o la respuesta de un guardado propio).
  useEffect(() => {
    setType(assignment.type);
    setClientId(assignment.client?.id ?? null);
    setProjectId(assignment.project?.id ?? null);
  }, [assignment.type, assignment.client?.id, assignment.project?.id]);

  // Comentarios y HH también: al reabrir el modal la fila se monta con la lista en caché, que puede ser
  // anterior al último guardado (el de HH se dispara con el blur al cerrar) y se refresca después.
  useEffect(() => setComments(assignment.comments), [assignment.comments]);
  useEffect(() => setHours(String(assignment.assignedHours)), [assignment.assignedHours]);

  const showProjectSelectors = FORECAST_TYPES_WITH_PROJECT.includes(type);
  const { data: clients } = useClientsList(showProjectSelectors ? { page: 1, pageSize: 200, sortField: 'companyName' } : { pageSize: 1 });
  const { data: projects } = useProjectsList(
    showProjectSelectors && clientId ? { page: 1, pageSize: 200, sortField: 'name', clientId } : { pageSize: 1 },
  );

  // El proyecto actual se muestra aunque la fila no tenga cliente (filas antiguas): sin él la lista
  // viene vacía y el selector aparecía en blanco.
  const projectOptions = (projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }));
  if (projectId === assignment.project?.id && assignment.project && !projectOptions.some((option) => option.value === assignment.project?.id)) {
    projectOptions.unshift({ value: assignment.project.id, label: assignment.project.name });
  }

  const commit = (patch: Partial<{ type: ForecastAssignmentType; clientId: string | null; projectId: string | null; comments: string; assignedHours: number }>) => {
    const nextType = patch.type ?? type;
    const nextClientId = patch.clientId !== undefined ? patch.clientId : clientId;
    const nextProjectId = patch.projectId !== undefined ? patch.projectId : projectId;
    if (patch.type !== undefined) setType(patch.type);
    if (patch.clientId !== undefined) setClientId(patch.clientId);
    if (patch.projectId !== undefined) setProjectId(patch.projectId);

    updateAssignment.mutate(
      {
        assignmentId: assignment.id,
        input: {
          type: nextType,
          clientId: nextClientId,
          projectId: nextProjectId,
          comments: patch.comments ?? comments,
          assignedHours: patch.assignedHours ?? Number(hours),
        },
      },
      { onError: onMutationError(toast, 'No se pudo guardar el cambio.') },
    );
  };

  return (
    <div className={styles.row}>
      <div className={[styles.typeGroup, showProjectSelectors ? styles.typeGroupWithProject : ''].filter(Boolean).join(' ')}>
        <Select
          label="Tipo"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(event) => commit({ type: event.target.value as ForecastAssignmentType, clientId: null, projectId: null })}
        />
        {showProjectSelectors && (
          <>
            <Select
              label="Cliente"
              placeholder="Sin cliente"
              options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
              value={clientId ?? ''}
              onChange={(event) => commit({ clientId: event.target.value || null, projectId: null })}
            />
            <Select
              label="Proyecto"
              placeholder="Sin proyecto"
              options={projectOptions}
              value={projectId ?? ''}
              disabled={!clientId}
              onChange={(event) => commit({ projectId: event.target.value || null })}
            />
          </>
        )}
      </div>

      <TextField
        label="Comentarios"
        value={comments}
        onChange={(event) => setComments(event.target.value)}
        onBlur={() => commit({ comments })}
      />

      <TextField
        label="HH"
        type="number"
        min={0}
        max={maxHours}
        step="0.5"
        value={hours}
        onChange={(event) => setHours(event.target.value)}
        onBlur={() => commit({ assignedHours: Number(hours) || 0 })}
      />

      <button
        type="button"
        className={styles.deleteButton}
        aria-label="Eliminar asignación"
        onClick={() => removeAssignment.mutate(assignment.id, { onError: onMutationError(toast, 'No se pudo eliminar la fila.') })}
      >
        <CloseIcon size={16} />
      </button>

      {coveredHours > 0 && (
        <p className={styles.coveredNote}>
          {coveredHours >= assignment.assignedHours
            ? `Cubiertas por tramos o tareas de este proyecto: estas ${formatHours(assignment.assignedHours)} no suman aparte.`
            : `${formatHours(coveredHours)} de estas ${formatHours(assignment.assignedHours)} ya las cubren tramos o tareas de este proyecto: solo suman ${formatHours(assignment.assignedHours - coveredHours)}.`}
        </p>
      )}
    </div>
  );
}
