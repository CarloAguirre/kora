import type { AppliedQuotationPlanning, ProjectDetail, ProjectModule, ProjectModuleTask } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { PencilIcon } from '@/shared/components/icons/Icons';
import styles from './ProjectModulesCard.module.css';
import { displayProposedDate, proposedBlockPeriod } from '../lib/quotation-relative-dates';

type CommercialModule = AppliedQuotationPlanning['modules'][number];
type CommercialBlock = NonNullable<CommercialModule['relativeTeamBlocks']>[number];
type CommercialTask = CommercialModule['tasks'][number];

/** Panel de un bloque REFERENCIAL, no un segmento operativo con fechas.
 * Conserva intactas las tareas reales; convertir una EDT requiere el flujo
 * de creación normal con fechas/colaborador y sus validaciones de backend. */
export function ReferenceBlockDrawer({
  project, module, block, reference, versionId, onClose, onPlan,
  onCreateReference, onEditTask, onDuplicateTask,
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
}) {
  const proposed = proposedBlockPeriod(project.startDate, block.startWeek, block.durationWeeks);
  const proposedLabel = proposed
    ? displayProposedDate(proposed.startDate) + ' → ' + displayProposedDate(proposed.endDate)
    : null;
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
    headerExtra={<Badge tone="neutral">{proposed ? 'Fechas propuestas' : 'Sin fechas'}</Badge>}
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
        <span>Fechas <b>{proposedLabel ?? 'Por definir'}</b></span>
        <span>HH estimadas <b>{block.hours}</b></span>
        <span>HH consumidas <b>Sin desglose por bloque</b></span>
      </div>
      <p className={styles.drawerHint}>
        {proposedLabel
          ? 'Propuesta calculada a partir del inicio del proyecto y las semanas de la cotización: ' +
            proposedLabel + '. Confírmala mediante «Planificar bloque». Todavía no existe un segmento operativo.'
          : 'Define el inicio del proyecto para calcular las fechas propuestas. Las semanas del ' +
            'presupuesto son relativas; aún no existe un segmento operativo.'}
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
      <div className={styles.drawerSection}>
        <div className={styles.drawerTaskHeading}>
          <h4>Tareas ({pending.length + savedTasks.length})</h4>
          {onCreateReference && pending.length > 0 && <Button variant="outline" size="sm"
            onClick={() => onCreateReference(pending[0]!)}>Asignar tareas</Button>}
        </div>
        <ul className={styles.drawerTaskList}>
          {savedTasks.map((task) => <li className={styles.drawerTaskRow} key={task.id}>
            <div><strong>{task.name}</strong>
              <small>{task.assigneeName ?? 'Sin asignar'} · {task.estimatedHours ?? '—'} HH est.</small>
            </div>
            {onEditTask && <button type="button" className={styles.taskIconAction}
              aria-label={'Editar tarea ' + task.name} onClick={() => onEditTask(task)}>
              <PencilIcon size={15} />
            </button>}
            {onDuplicateTask && <Button variant="ghost" size="sm"
              onClick={() => onDuplicateTask(task)}>Duplicar</Button>}
          </li>)}
          {pending.map((task) => <li className={styles.drawerTaskRow}
            key={task.wbs + ':' + task.role}>
            <div><strong>{task.name}</strong>
              <small>Sin asignar · {task.hours} HH est. · Referencia EDT, sin fechas operativas</small>
            </div>
            {onCreateReference && <Button size="sm" variant="ghost"
              onClick={() => onCreateReference(task)}>Asignar tarea</Button>}
          </li>)}
        </ul>
      </div>
    </div>
  </Modal>;
}
