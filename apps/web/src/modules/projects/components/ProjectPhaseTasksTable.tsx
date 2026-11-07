import type { ReactNode } from 'react';
import {
  type AppliedQuotationPlanning, type ProjectModule, type ProjectModuleTask, type ProjectTeam,
} from '@kora/contracts';
import { PencilIcon, CopyIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { Button } from '@/shared/components/ui/Button';
import { roleFromTeamName } from '@/modules/client-portal/adapters/project-detail.adapter';
import styles from './ProjectModulesCard.module.css';
import { RoadmapTaskStatusBadges } from './RoadmapTaskStatusBadges';

type ReferenceTask = AppliedQuotationPlanning['modules'][number]['tasks'][number];
type CommercialPhase = AppliedQuotationPlanning['modules'][number];
interface ProjectPhaseTasksTableProps {
  module: ProjectModule;
  teams?: readonly Pick<ProjectTeam, 'teamId' | 'teamName'>[];
  teamOptions?: ReadonlyArray<{ value: string; label: string }>;
  commercial?: CommercialPhase;
  quotationVersionId?: string;
  references?: readonly ReferenceTask[];
  canManage: boolean;
  /** Colaborador: misma tabla y estados, sin columna de gestión ni HH por tarea. */
  readOnly?: boolean;
  referenceDeletePending?: boolean;
  onReviewTask?: (task: ProjectModuleTask) => ReactNode;
  onEditTask?: (task: ProjectModuleTask) => void;
  onDuplicateTask?: (task: ProjectModuleTask) => void;
  onDeleteTask?: (task: ProjectModuleTask) => void;
  onEditReference?: (task: ReferenceTask) => void;
  onDeleteReference?: (task: ReferenceTask) => void;
  onAddTask?: () => void;
}
const date = (value: string | null) => value
  ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL') : '—';
const formatDate = date;
const parseDate = (value: string) => new Date(value + 'T00:00:00');
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const operationalTeamColor = (name: string | null) => ({
  dev: '#ea7a1f', pmo: '#64748b', qa: '#3b82f6',
  ux: '#22a55a', ia: '#e0526b', rpa: '#14a3a0',
})[roleFromTeamName(name)];
/**
 * Tabla de tareas operativas compartida entre Líder/PMO y colaborador.
 * Los handlers son opcionales y se anulan siempre en modo solo lectura.
 */
export function ProjectPhaseTasksTable({
  module, teams = [], teamOptions = [], commercial, quotationVersionId,
  references = [], canManage, readOnly = false, referenceDeletePending = false,
  onReviewTask, onEditTask, onDuplicateTask, onDeleteTask,
  onEditReference, onDeleteReference, onAddTask,
}: ProjectPhaseTasksTableProps) {
  const showActions = canManage && !readOnly;
  const count = module.tasks.length + references.length;
  const approved = module.tasks.filter((task) => task.status === 'done').length;
  return (
      <details className={styles.operationalTasks} open>
        <summary><strong>Tareas</strong> {count}, {approved} aprobadas</summary>
        {count ? <div className={styles.operationalTaskScroll}
          role="region" aria-label={'Tabla de tareas de ' + module.name} tabIndex={0}>
          <table className={[styles.operationalTaskTable, readOnly ? styles.readonlyTaskTable : ''].filter(Boolean).join(' ')}>
            <thead><tr><th>Tarea</th><th>Asignada a</th><th>Bloque de trabajo</th>
              <th>Estado</th>{!readOnly && <th>HH est. / reales</th>}<th>Fecha límite</th>{showActions && <th aria-label="Acciones" />}</tr></thead>
            <tbody>
              {module.tasks.map((task) => (
                <tr key={task.id}>
                  <td className={styles.operationalTaskTitle}>{task.name}</td>
                  <td>{task.assigneeName || 'Sin asignar'}</td>
                  <td>{(() => {
                    const linked = module.segments.find((segment) =>
                      task.segmentId === segment.id ||
                      (!task.segmentId && task.description?.includes(
                        'Bloque de trabajo: ' + segment.name + ' · ID ' + segment.id)));
                    if (linked) return <>
                      <span className={styles.operationalTeamDot}
                        style={{ background: operationalTeamColor(linked.teamName) }} />
                      {linked.name}
                    </>;
                    // Una referencia EDT convertida puede conservar el WBS
                    // sin segmentId. Recuperar SOLO su bloque comercial de
                    // origen, sin fingir un vínculo con un segmento operativo.
                    const source = commercial?.tasks.find((reference) =>
                      task.description?.includes(
                        'Referencia cotización ' + quotationVersionId +
                        ' · WBS ' + reference.wbs + ' · ' + reference.role));
                    const sourceTeamId = source?.teamId;
                    if (sourceTeamId) {
                      const sourceTeamName = teams.find((team) =>
                        team.teamId === sourceTeamId)?.teamName ??
                        teamOptions.find((team) => team.value === sourceTeamId)?.label ??
                        source?.role ?? 'Equipo';
                      return <span title="Bloque de origen de la cotización; falta vincular el segmento operativo">
                        <span className={styles.operationalTeamDot}
                          style={{ background: operationalTeamColor(sourceTeamName) }} />
                        {module.name} · {sourceTeamName}
                      </span>;
                    }
                    return <span className={styles.unlinkedBlock}>Sin bloque de origen identificado</span>;
                  })()}</td>
                  <td><RoadmapTaskStatusBadges status={task.status}
                    assigned={Boolean(task.assigneeUserId)}
                    rejectionReason={task.rejectionReason}
                    overdue={parseDate(task.date) < today()} /></td>
                  {!readOnly && (<td title={task.actualHours == null
                    ? 'Sin HH aprobadas asociadas explícitamente a esta tarea.'
                    : 'HH reales de bitácora aprobadas y vinculadas a esta tarea.'}>
                    {task.estimatedHours ?? '—'} / {task.actualHours ?? '—'}
                    {(task.pendingHours ?? 0) > 0 && (
                      <small className={styles.taskPendingHours}>
                        {task.pendingHours?.toLocaleString('es-CL', { maximumFractionDigits: 2 })} HH por aprobar
                      </small>
                    )}
                  </td>)}
                  <td>{formatDate(task.date)}</td>
                  {showActions && (<td className={styles.operationalTaskActions}>
                    {showActions && task.status === 'in_review' && !task.cancelledAt &&
                      onReviewTask?.(task)}
                    {showActions && <>
                      <Button variant="ghost" size="icon" className={styles.taskIconAction}
                        aria-label={'Editar tarea ' + task.name} title="Editar tarea"
                        onClick={() => onEditTask?.(task)}><PencilIcon size={15} /></Button>
                      {task.assigneeUserId && <Button variant="ghost" size="icon" className={styles.taskIconAction}
                        aria-label={'Duplicar tarea ' + task.name} title="Duplicar para otra persona"
                        onClick={() => onDuplicateTask?.(task)}>
                        <CopyIcon size={15} />
                      </Button>}
                      <Button variant="ghost" size="icon" className={styles.taskIconAction}
                        aria-label={'Eliminar tarea ' + task.name} title="Eliminar tarea"
                        onClick={() => onDeleteTask?.(task)}><TrashIcon size={15} /></Button>
                    </>}
                  </td>)}
                </tr>
              ))}
              {references.map((reference) => {
                const teamName = teams.find((team) => team.teamId === reference.teamId)?.teamName ??
                  teamOptions.find((team) => team.value === reference.teamId)?.label ?? reference.role;
                return <tr key={'ref:' + reference.wbs + ':' + reference.role}>
                  <td className={styles.operationalTaskTitle} title="Referencia de cotización pendiente de crear como tarea operativa">{reference.name}</td>
                  <td>Sin asignar</td>
                  <td>{reference.teamId ? <span
                    title="Bloque de origen de la estimación comercial. La tarea todavía no está vinculada operativamente">
                    <span className={styles.operationalTeamDot}
                      style={{ background: operationalTeamColor(teamName) }} />
                    {module.name} · {teamName}
                  </span> : <span className={styles.unlinkedBlock}>Sin bloque de origen identificado</span>}</td>
                  <td><RoadmapTaskStatusBadges status="todo" assigned={false}
                    unassignedTitle={'Equipo: ' + teamName} /></td>
                  {!readOnly && <td>{reference.hours} / —</td>}
                  <td>—</td>
                  {showActions && (<td className={styles.operationalTaskActions}>
                    {showActions && <>
                      <Button variant="ghost" size="icon" className={styles.taskIconAction}
                        aria-label={'Editar tarea ' + reference.name} title="Editar tarea"
                        onClick={() => onEditReference?.(reference)}><PencilIcon size={15} /></Button>
                      <Button variant="ghost" size="icon" className={styles.taskIconAction}
                        aria-label={'Eliminar tarea ' + reference.name} title="Eliminar tarea"
                        disabled={referenceDeletePending}
                        onClick={() => onDeleteReference?.(reference)}>
                        <TrashIcon size={15} />
                      </Button>
                    </>}
                  </td>)}
                </tr>;
              })}
            </tbody>
          </table>
        </div> : <p className={styles.noOperationalTasks}>Sin tareas registradas en esta fase.</p>}
        {showActions && <Button variant="tertiary" size="sm" className={styles.addTaskButton}
          onClick={() => onAddTask?.()}>+ Agregar tarea</Button>}
      </details>
  );
}
