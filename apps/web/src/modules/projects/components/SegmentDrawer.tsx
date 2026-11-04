import { useState } from 'react';
import {
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type ProjectDetail,
  type ProjectModule,
  type ProjectModuleSegment,
  type ProjectModuleTask,
  type AppliedQuotationPlanning,
} from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { CopyIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { roleFromTeamName } from '@/modules/client-portal/adapters/project-detail.adapter';
import { PHASE_ROADMAP_ROLE_COLORS } from '@/modules/client-portal/types';
import { useUpdateProjectModuleDelivery } from '../api/projects.queries';
import {
  currentChileDate, getLinkedBlockTasks, roadmapBlockMetrics,
  type TeamBlockProgress,
} from '../lib/team-progress';
import styles from './SegmentDrawer.module.css';

type Reference = AppliedQuotationPlanning['modules'][number];

export interface SegmentDrawerProps {
  project: ProjectDetail;
  module: ProjectModule;
  segment: ProjectModuleSegment;
  reference?: Reference;
  blockProgress?: TeamBlockProgress;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEditMembers?: () => void;
  onChangeClosure?: (action: 'close' | 'reopen') => void;
  onAssignTasks?: () => void;
  onAddTask?: () => void;
  onEditTask?: (task: ProjectModuleTask) => void;
  onDuplicateTask?: (task: ProjectModuleTask) => void;
  onDeleteTask?: (task: ProjectModuleTask) => void;
}

const dateShort = (raw: string): string => {
  const value = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.slice(8, 10) + '-' + value.slice(5, 7) : '—';
};
const dateFull = (raw: string): string => {
  const value = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.slice(8, 10) + '-' + value.slice(5, 7) + '-' + value.slice(0, 4) : '—';
};
const hh = (value: number): string =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const badgeLabel = (name: string) => {
  const role = roleFromTeamName(name);
  return ({ dev: 'DEV', ux: 'UX', qa: 'QA', pmo: 'PMO', rpa: 'RPA',
    ia: 'IA' } as Partial<Record<typeof role, string>>)[role] ??
    name.slice(0, 3).toUpperCase();
};

/** Panel lateral operativo. Las tres variantes comparten los mismos datos,
 * pero distinguen entrega aprobada, entrega vencida y cierre sin entrega.
 * No se atribuye un cierre a una persona: la API aún no expone closedBy. */
export function SegmentDrawer({
  project, module, segment, reference, blockProgress, onClose,
  onEdit, onDelete, onEditMembers, onChangeClosure, onAssignTasks,
  onAddTask, onEditTask, onDuplicateTask, onDeleteTask,
}: SegmentDrawerProps) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [comment, setComment] = useState('');
  const team = project.teams.find((item) => item.teamId === segment.teamId);
  const delivery = module.deliveries.find((item) => item.segmentId === segment.id) ?? null;
  const tasks = getLinkedBlockTasks(module, segment);
  const approvedTasks = tasks.filter((task) => task.status === 'done');
  const { hours, progress } = roadmapBlockMetrics(blockProgress);
  const expectedPercent = blockProgress?.expectedPercent ?? null;
  const today = currentChileDate();

  const deliveryOverdue = delivery?.status === 'planned' && delivery.estimatedDate < today;
  const closedByDelivery = delivery?.status === 'approved';
  const closedWithoutDelivery = !delivery && Boolean(segment.closedAt);
  const state = deliveryOverdue
    ? 'Entrega vencida'
    : (closedByDelivery || closedWithoutDelivery || Boolean(segment.closedAt))
      ? 'Cerrado'
      : delivery?.status === 'delivered' ? 'Entregada'
        : segment.endDate < today ? 'Vencido'
          : segment.startDate <= today ? 'En curso' : 'Próximo';
  const stateClass = deliveryOverdue || state === 'Vencido' ? styles.stateOverdue
    : state === 'Cerrado' || state === 'Entregada' ? styles.stateClosed
      : styles.statePending;

  const canMarkDelivered = delivery?.status === 'planned' && Boolean(onEdit) &&
    Boolean(delivery.canManage) && Boolean(delivery.assigneeUserId);
  const canAddTask = Boolean(onAddTask) && !segment.closedAt && !closedByDelivery;
  const canCloseManually = !segment.closedAt && !delivery && tasks.length > 0 &&
    tasks.every((task) => task.status === 'done') && Boolean(onChangeClosure);
  const pendingReferences = reference?.tasks.some((task) =>
    task.teamId === segment.teamId && !tasks.some((saved) =>
      saved.description?.includes(' · WBS ' + task.wbs + ' · ' + task.role))) ?? false;

  const submitDelivery = async () => {
    if (!delivery || !canMarkDelivered || !comment.trim()) return;
    try {
      await updateDelivery.mutateAsync({
        projectId: project.id, moduleId: module.id, deliveryId: delivery.id,
        input: { status: 'delivered', comment: comment.trim() },
      });
      toast.success('Entrega marcada como realizada; queda pendiente de aprobación.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError
        ? error.message : 'No se pudo registrar la entrega.');
    }
  };

  return <Modal open side className={styles.drawer} title={segment.name}
    eyebrow={'Fase ' + (project.modules.findIndex((item) => item.id === module.id) + 1) +
      ': ' + module.name}
    onClose={onClose}
    footer={onEdit || onDelete ? <>
      {onDelete && <Button variant="outline" onClick={onDelete}>Eliminar bloque</Button>}
      {onEdit && <Button onClick={onEdit}>Editar bloque</Button>}
    </> : undefined}>
    <div className={styles.content}>
      <div className={styles.teamHeader}>
        <div className={styles.teamIdentity}>
          <span className={styles.teamBadge}
            style={{ background: PHASE_ROADMAP_ROLE_COLORS[roleFromTeamName(segment.teamName)] }}>
            {badgeLabel(segment.teamName)}
          </span>
          <div className={styles.teamDetails}>
            <strong>{segment.teamName}</strong>
            <small>Líder: {team?.leader?.fullName ?? 'Sin líder asignado'}</small>
          </div>
        </div>
        <span className={[styles.state, stateClass].join(' ')} aria-label={'Estado: ' + state}>
          <span aria-hidden="true">●</span> {state}
        </span>
      </div>

      <div className={styles.metrics} aria-label="Datos del bloque">
        <div><span>Fechas</span><strong>{dateShort(segment.startDate)} — {dateShort(segment.endDate)}</strong></div>
        <div><span>HH estimadas</span><strong>{hours == null ? '—' : hh(hours)}</strong></div>
        <div><span>HH consumidas</span><strong>{hh(segment.consumedHours ?? 0)}</strong></div>
      </div>

      <section className={styles.progressSection} aria-label="Avance del bloque">
        <h3>Avance</h3>
        <div className={styles.progressBar} role="progressbar"
          aria-label="Avance real del bloque" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progress ?? undefined}>
          {progress !== null && <span style={{ width: progress + '%' }} />}
          {expectedPercent !== null && <i style={{ left: expectedPercent + '%' }}
            title={'Plan a hoy: ' + expectedPercent + '%'} />}
        </div>
        <p className={styles.progressExplanation}>
          {progress === null ? 'Sin HH operativas planificadas.' :
            progress + '% real; ' +
            (expectedPercent === null ? 'sin fechas de referencia.' :
              expectedPercent + '% según el plan a hoy.')}
          {' '}
          {closedByDelivery && 'Cerrado con entrega aprobada' +
            (segment.closedAt ? ' el ' + dateFull(segment.closedAt) : '') + '.'}
          {closedWithoutDelivery && 'Cierre del bloque registrado el ' +
            dateFull(segment.closedAt!) + '.'}
          {deliveryOverdue && 'La entrega de cierre está vencida.'}
          {delivery?.status === 'delivered' &&
            'Entrega presentada; pendiente de aprobación.'}
          {!segment.closedAt && !delivery && approvedTasks.length > 0 &&
            approvedTasks.length === tasks.length &&
            ' Todas las tareas del bloque están aprobadas.'}
        </p>
        <p className={styles.hoursNote}>
          HH consumidas atribuidas a este bloque: {hh(segment.consumedHours ?? 0)}.
          El consumo es costo y no determina el avance real.
        </p>
      </section>

      <section className={styles.deliverySection} aria-label={delivery ? 'Entrega de cierre' : 'Cierre del bloque'}>
        <h3>{delivery ? 'Entrega de cierre' : 'Cierre del bloque'}</h3>
        {delivery ? <>
          <div className={[styles.deliveryCard,
            deliveryOverdue ? styles.deliveryOverdue :
              delivery.status === 'approved' || delivery.status === 'delivered'
                ? styles.deliverySuccess : styles.deliveryNeutral].join(' ')}>
            <span className={styles.diamond} aria-hidden="true">◆</span>
            <div className={styles.deliveryInfo}>
              <strong>{delivery.name ?? module.name + ' · ' + segment.teamName}</strong>
              <small>Fecha planificada: {dateFull(delivery.estimatedDate)}
                {deliveryOverdue ? ' (vencida)' : ''}</small>
              {delivery.assigneeName && <small>Responsable: {delivery.assigneeName}</small>}
              {delivery.status === 'approved' && <small>Entrega aprobada</small>}
              {delivery.status === 'delivered' && <small>Entregada; pendiente de aprobación</small>}
            </div>
          </div>
          {canMarkDelivered && <>
            {!showDeliveryForm ? <button type="button" className={styles.markDelivered}
              onClick={() => setShowDeliveryForm(true)}>Marcar como entregada</button> :
              <div className={styles.deliveryForm}>
                <label htmlFor={'delivery-comment-' + delivery.id}>Comentario de entrega</label>
                <textarea id={'delivery-comment-' + delivery.id} rows={3}
                  maxLength={1000} placeholder="Describe la entrega realizada"
                  value={comment} onChange={(event) => setComment(event.target.value)} />
                <div className={styles.deliveryActions}>
                  <Button size="sm" variant="outline" onClick={() => setShowDeliveryForm(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={!comment.trim() || updateDelivery.isPending}
                    loading={updateDelivery.isPending} onClick={() => void submitDelivery()}>
                    Confirmar entrega
                  </Button>
                </div>
              </div>}
          </>}
        </> : <p className={styles.closureNote}>
          {segment.closedAt
            ? 'Este bloque no tiene entrega de cierre. Su cierre quedó registrado el ' +
              dateFull(segment.closedAt) + '.'
            : 'Este bloque no tiene entrega de cierre. Puedes registrarla desde «Editar bloque».'}
        </p>}
        {segment.closedAt && onChangeClosure && <Button size="sm" variant="outline"
          onClick={() => onChangeClosure('reopen')}>Reabrir bloque</Button>}
        {canCloseManually && <Button size="sm" variant="outline"
          onClick={() => onChangeClosure?.('close')}>Cerrar bloque</Button>}
      </section>

      {segment.members.length > 0 && <section className={styles.membersSection}>
        <h3>Colaboradores ({segment.members.length})</h3>
        <div className={styles.members}>
          {segment.members.map((member) => <span key={member.teamMemberId}>
            {member.fullName}
            {member.dailyPercent != null && ' · ' + member.dailyPercent + '% diario'}
          </span>)}
        </div>
      </section>}
      {onEditMembers && <button type="button" className={styles.membersLink} onClick={onEditMembers}>
        Colaboradores / Forecast
      </button>}

      <section className={styles.tasksSection} aria-label="Tareas del bloque">
        <div className={styles.tasksHeading}>
          <h3>Tareas ({tasks.length})</h3>
          {canAddTask && <button type="button" className={styles.addTask}
            onClick={onAddTask}>+ Agregar tarea</button>}
          {onAssignTasks && pendingReferences && <button type="button"
            className={styles.addTask} onClick={onAssignTasks}>Asignar tareas EDT</button>}
        </div>
        {tasks.length ? <ul className={styles.taskList}>
          {tasks.map((task) => <li key={task.id} className={styles.taskRow}>
            <div className={styles.taskInfo}>
              <strong>{task.name}</strong>
              <small>{task.assigneeName ?? 'Sin asignar'} · {task.estimatedHours == null
                ? 'HH sin definir' : hh(task.estimatedHours) + ' HH est.'}
                {' '}· Límite {dateFull(task.date)}</small>
            </div>
            <span className={[styles.taskStatus,
              task.status === 'done' ? styles.taskApproved :
                task.status === 'in_review' ? styles.taskReview : styles.taskPending].join(' ')}>
              {PROJECT_MODULE_TASK_STATUS_LABELS[task.status]}
            </span>
            <div className={styles.taskActions}>
              {onEditTask && <button type="button" title="Editar tarea"
                aria-label={'Editar tarea ' + task.name} onClick={() => onEditTask(task)}>
                <PencilIcon size={14} />
              </button>}
              {onDuplicateTask && <button type="button" title="Duplicar tarea"
                aria-label={'Duplicar tarea ' + task.name} onClick={() => onDuplicateTask(task)}>
                <CopyIcon size={14} />
              </button>}
              {onDeleteTask && <button type="button" title="Eliminar tarea"
                aria-label={'Eliminar tarea ' + task.name} onClick={() => onDeleteTask(task)}>
                <TrashIcon size={14} />
              </button>}
            </div>
          </li>)}
        </ul> : <p className={styles.emptyTasks}>Sin tareas operativas vinculadas a este bloque.</p>}
      </section>
    </div>
  </Modal>;
}
