import type { AppliedQuotationPlanning, ProjectDetail, ProjectModule, ProjectModuleTask } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { CopyIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { RoadmapTaskStatusBadges } from './RoadmapTaskStatusBadges';
import taskStyles from './SegmentDrawer.module.css';
import styles from './ProjectModulesCard.module.css';

type CommercialModule = AppliedQuotationPlanning['modules'][number];
type CommercialBlock = NonNullable<CommercialModule['relativeTeamBlocks']>[number];
type CommercialTask = CommercialModule['tasks'][number];

/** Panel de un bloque REFERENCIAL, no un segmento operativo con fechas.
 * Conserva intactas las tareas reales; convertir una EDT requiere el flujo
 * de creación normal con fechas/colaborador y sus validaciones de backend. */
export function ReferenceBlockDrawer({
  project, module, block, reference, versionId, onClose, onPlan,
  onCreateReference, onEditTask, onDuplicateTask, onDeleteTask,
  onEditReference, onDuplicateReference, onDeleteReference,
}: {
  project: ProjectDetail;
  module: ProjectModule;
  block: CommercialBlock;
  reference: CommercialModule;
  versionId: string;
  onClose: () => void;
  onPlan?: () => void;
  onCreateReference?: (task: CommercialTask) => void;
  onEditTask?: (task: ProjectModuleTask) => void;
  onDuplicateTask?: (task: ProjectModuleTask) => void;
  onDeleteTask?: (task: ProjectModuleTask) => void;
  onEditReference?: (task: CommercialTask) => void;
  onDuplicateReference?: (task: CommercialTask) => void;
  onDeleteReference?: (task: CommercialTask) => void;
}) {
  const alreadyStarted = project.status === 'active' && Boolean(project.startDate);
  const team = project.teams.find((entry) => entry.teamId === block.teamId);
  const teamName = team?.teamName ?? 'Equipo pendiente de vinculación';
  const tasks = reference.tasks.filter((task) => task.teamId === block.teamId);
  const converted = (referenceTask: CommercialTask) => module.tasks.some((task) =>
    task.description?.includes('Referencia cotización ' + versionId +
      ' · WBS ' + referenceTask.wbs + ' · ' + referenceTask.role));
  const pending = tasks.filter((task) => !converted(task));
  const savedTasks = module.tasks.filter((task) => task.teamId === block.teamId);
  const activeMembers = project.members.filter((member) =>
    member.teamId === block.teamId && member.userStatus === 'active');

  return <Modal open side title={module.name} description={'Fase · ' + module.name}
    headerExtra={<Badge tone="neutral">Sin bloque operativo</Badge>}
    onClose={onClose} footer={onPlan ? <div className={styles.drawerFooter}>
      <Button onClick={onPlan}>Planificar bloque</Button>
    </div> : undefined}>
    <div className={styles.drawerScroll}>
      <p className={styles.drawerTeam}>
        <span className={styles.referenceTaskDot} aria-hidden="true" />
        <strong>{teamName}</strong>
        <span>Líder: {team?.leader?.fullName ?? 'Sin líder asignado'}</span>
      </p>
      <div className={styles.drawerFacts}>
        <span>Fechas <b>Por definir</b></span>
        <span>HH estimadas <b>{block.hours}</b></span>
        <span>HH consumidas <b>Sin desglose por bloque</b></span>
      </div>
      <p className={styles.drawerHint}>
        {alreadyStarted
          ? 'Este equipo todavía no tiene un bloque operativo. Revisa los equipos vinculados y el calendario de la cotización transferida.'
          : 'Al iniciar el proyecto se generarán automáticamente los bloques y las fechas definitivas del calendario aprobado, sin una segunda aprobación.'}
      </p>
      <div className={styles.drawerSection}>
        <h4>Avance</h4>
        <p className={styles.drawerHint}>Sin avance operativo verificable hasta planificar el bloque.</p>
      </div>
      <div className={styles.drawerSection}>
        <h4>Entrega de cierre</h4>
        <div className={styles.drawerDelivery}>
          <strong>{module.name} · {teamName}</strong>
          <span>Fecha planificada: —</span>
          <span>La entrega se define al planificar el trabajo; no se crea automáticamente.</span>
        </div>
      </div>
      {pending.length > 0 && <div className={styles.awaitingAssignment}>
        <span className={styles.awaitingBadge}>{teamName.slice(0, 3).toUpperCase()}</span>
        <div className={styles.awaitingText}>
          <strong>{pending.length} {pending.length === 1 ? 'tarea espera' : 'tareas esperan'} asignación</strong>
          <span>{activeMembers.length === 0
            ? 'No hay colaboradores activos de este equipo en el proyecto.' +
              (team?.leader?.fullName ? ' Esperando que ' + team.leader.fullName + ' asigne colaboradores.' : '')
            : 'Las referencias EDT deben convertirse en tareas con fechas antes de asignarlas.'}</span>
        </div>
      </div>}
      <section className={[styles.drawerSection, taskStyles.tasksSection].join(' ')}
        aria-label="Tareas del bloque">
        <div className={taskStyles.tasksHeading}>
          <h3>Tareas (${pending.length + savedTasks.length})</h3>
          {onCreateReference && pending.length > 0 && <Button variant="outline" size="sm"
            onClick={() => onCreateReference(pending[0]!)}>Asignar tareas EDT</Button>}
        </div>
        <ul className={taskStyles.taskList}>
          {savedTasks.map((task) => <li className={taskStyles.taskRow} key={task.id}>
            <div className={taskStyles.taskInfo}>
              <strong>{task.name}</strong>
              <small>{task.assigneeName ?? 'Sin asignar'} · {task.estimatedHours ?? '—'} HH est.
                {' '} / {task.actualHours ?? '—'} HH reales
                {' '}· Límite {task.date ? task.date.split('-').reverse().join('-') : '—'}</small>
            </div>
            <span className={taskStyles.taskStatusGroup}>
              <RoadmapTaskStatusBadges status={task.status}
                assigned={Boolean(task.assigneeUserId)}
                rejectionReason={task.rejectionReason} />
            </span>
            <div className={taskStyles.taskActions}>
              {onEditTask && <Button variant="ghost" size="icon" title="Editar tarea"
                aria-label={'Editar tarea ' + task.name} onClick={() => onEditTask(task)}>
                <PencilIcon size={14} />
              </Button>}
              {onDuplicateTask && <Button variant="ghost" size="icon" title="Duplicar tarea"
                aria-label={'Duplicar tarea ' + task.name} onClick={() => onDuplicateTask(task)}>
                <CopyIcon size={14} />
              </Button>}
              {onDeleteTask && <Button variant="ghost" size="icon" title="Eliminar tarea"
                aria-label={'Eliminar tarea ' + task.name} onClick={() => onDeleteTask(task)}>
                <TrashIcon size={14} />
              </Button>}
            </div>
          </li>)}
          {pending.map((task) => <li className={taskStyles.taskRow}
            key={task.wbs + ':' + task.role}>
            <div className={taskStyles.taskInfo}>
              <strong>{task.name}</strong>
              <small>Sin asignar · {task.hours} HH est. · Referencia EDT, sin fechas operativas</small>
            </div>
            <span className={taskStyles.taskStatusGroup}>
              <RoadmapTaskStatusBadges status="todo" assigned={false} />
            </span>
            <div className={taskStyles.taskActions}>
              {onEditReference && <Button variant="ghost" size="icon" title="Editar tarea"
                aria-label={'Editar tarea ' + task.name} onClick={() => onEditReference(task)}>
                <PencilIcon size={14} />
              </Button>}
              {onDuplicateReference && <Button variant="ghost" size="icon" title="Duplicar tarea"
                aria-label={'Duplicar tarea ' + task.name} onClick={() => onDuplicateReference(task)}>
                <CopyIcon size={14} />
              </Button>}
              {onDeleteReference && <Button variant="ghost" size="icon" title="Eliminar tarea"
                aria-label={'Eliminar tarea ' + task.name} onClick={() => onDeleteReference(task)}>
                <TrashIcon size={14} />
              </Button>}
            </div>
          </li>)}
        </ul>
      </section>
    </div>
  </Modal>;
}
