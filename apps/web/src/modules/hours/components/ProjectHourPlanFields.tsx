import type { ProjectPhaseOption } from '@kora/contracts';
import { Select } from '@/shared/components/ui/Select';
import styles from './HourEntryFormDialog.module.css';
import { formatTaskHourSummary, OTHER_TASK_OPTION } from './hour-task-selection';

type PlanSegment = Pick<ProjectPhaseOption['segments'][number], 'id' | 'name' | 'teamName' | 'startDate' | 'endDate'>;
type PlanTask = Pick<ProjectPhaseOption['tasks'][number], 'id' | 'name' | 'estimatedHours' | 'actualHours' | 'pendingHours'>;
type PlanPhase = Pick<ProjectPhaseOption, 'id' | 'name'>;

export interface ProjectHourPlanFieldsProps {
  phases: readonly PlanPhase[];
  phaseId: string;
  segments: readonly PlanSegment[];
  segmentId: string;
  tasks: readonly PlanTask[];
  taskId: string;
  requiresPhase: boolean;
  /** Etiqueta verificable del aprobador, cuando se encuentra en el detalle. */
  approverName?: string | null;
  onPhaseChange: (id: string) => void;
  onSegmentChange: (id: string) => void;
  onTaskChange: (id: string) => void;
}

/**
 * Selector compartido por registro diario, semanal y edición.
 * Fase -> Bloque -> Tarea: la tarea siempre queda ligada al bloque elegido.
 * «Otro» es una opción explícita de UI, no se envía como task_id.
 */
export function ProjectHourPlanFields({
  phases, phaseId, segments, segmentId, tasks, taskId, requiresPhase, approverName,
  onPhaseChange, onSegmentChange, onTaskChange,
}: ProjectHourPlanFieldsProps) {
  const selectedTask = tasks.find((task) => task.id === taskId);
  const showTriplet = Boolean(phaseId);
  return (
    <section className={styles.projectPlanPanel} aria-label="Vincula estas horas al plan">
      <div className={styles.projectPlanHeader}>
        <strong>Vincula estas horas al plan</strong>
        <span>{approverName ? `Aprobador: ${approverName}` : 'Las horas serán revisadas por el líder correspondiente'}</span>
      </div>
      <div className={showTriplet ? styles.planFieldsTriple : styles.planFieldsSingle}>
        <Select label="Fase" required={requiresPhase}
          placeholder={phases.length > 0 ? 'Seleccionar fase...' : 'El proyecto no tiene fases'}
          options={phases.map((phase, index) => ({ value: phase.id, label: `Fase ${index + 1}: ${phase.name}` }))}
          value={phaseId} disabled={phases.length === 0}
          onChange={(event) => onPhaseChange(event.target.value)}
        />
        {showTriplet && <>
          <Select label="Bloque de trabajo" required={segments.length > 0}
            placeholder={segments.length ? 'Seleccionar bloque...' : 'Sin bloques disponibles'}
            disabled={!segments.length}
            options={segments.map((segment) => ({
              value: segment.id,
              label: segment.name,
            }))}
            value={segmentId} onChange={(event) => onSegmentChange(event.target.value)}
          />
          <Select label="Tarea" required={tasks.length > 0}
            placeholder={segmentId ? tasks.length ? 'Seleccionar tarea...' : 'Otro trabajo del bloque' : 'Selecciona un bloque'}
            disabled={!segmentId || tasks.length === 0}
            options={[
              ...tasks.map((task) => ({ value: task.id, label: task.name })),
              { value: OTHER_TASK_OPTION, label: 'Otro trabajo del bloque' },
            ]}
            value={taskId} onChange={(event) => onTaskChange(event.target.value)}
          />
        </>}
      </div>
      {selectedTask ? (
        <div className={styles.planTaskSummary} role="status">
          <strong>{formatTaskHourSummary(selectedTask.actualHours, selectedTask.estimatedHours)}</strong>
          {(selectedTask.pendingHours ?? 0) > 0 && (
            <span className={styles.planPendingHours}>
              {selectedTask.pendingHours?.toLocaleString('es-CL', { maximumFractionDigits: 2 })} HH pendientes de aprobación
            </span>
          )}
          <span>Las nuevas HH se registran por separado. Solo las aprobadas se suman a las reales del Roadmap.</span>
        </div>
      ) : <p className={styles.planHelp}>
        {phaseId && segmentId && tasks.length > 0
          ? 'Elige tu tarea asignada o «Otro trabajo del bloque» y describe la actividad que realizaste.'
          : 'Selecciona la fase y el bloque de tu equipo para vincular el registro. Las HH aprobadas se reflejarán en el Roadmap.'}
      </p>}
    </section>
  );
}
