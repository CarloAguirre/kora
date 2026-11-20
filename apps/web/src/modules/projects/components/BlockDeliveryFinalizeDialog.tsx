import { useEffect, useState } from 'react';
import type { ProjectModuleTask } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { RoadmapTaskStatusBadges } from './RoadmapTaskStatusBadges';
import { useUpdateProjectModuleDelivery, useUpdateProjectModuleTask } from '../api/projects.queries';
import { currentChileDate } from '../lib/team-progress';
import type { DeliveryActionTarget } from './DeliveryActionDialogs';
import styles from './BlockDeliveryFinalizeDialog.module.css';

const dateLabel = (value: string | null | undefined): string => {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4) : '—';
};

interface BlockDeliveryFinalizeDialogProps {
  projectId: string;
  target: DeliveryActionTarget | null;
  onClose: () => void;
}

/** Solo los bloques con tareas aprobadas pueden finalizar normalmente.
 * El cierre excepcional requiere una segunda confirmación; cancela tareas
 * lógicamente en el servidor, en la misma transacción que el cierre y la bitácora.
 * No aprueba tareas automáticamente ni borra HH históricas. */
export function BlockDeliveryFinalizeDialog({
  projectId, target, onClose,
}: BlockDeliveryFinalizeDialogProps) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const updateTask = useUpdateProjectModuleTask();
  const [forceConfirm, setForceConfirm] = useState(false);
  const [completedOn, setCompletedOn] = useState(currentChileDate);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const open = target?.action === 'finalize';
  const tasks = target?.blockTasks ?? [];
  const incompleteTasks = tasks.filter((task) => !task.cancelledAt && task.status !== 'done');
  const hasTasks = tasks.some((task) => !task.cancelledAt);
  const warning = !hasTasks || incompleteTasks.length > 0;
  const showForceConfirmation = open && forceConfirm && incompleteTasks.length > 0;
  const approving = updateTask.isPending;
  const submitting = updateDelivery.isPending;
  const busy = approving || submitting;

  useEffect(() => {
    if (open) {
      setCompletedOn(currentChileDate());
      setComment('');
      setError('');
      setForceConfirm(false);
    }
  // Reiniciar solo al elegir una nueva entrega; la actualización de props tras
  // aprobar una tarea NO debe cerrar el flujo ni borrar la evidencia escrita.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.delivery.id, open]);

  const approveTask = async (task: ProjectModuleTask) => {
    if (!target || busy || task.status !== 'in_review' || task.cancelledAt) return;
    try {
      await updateTask.mutateAsync({
        projectId, moduleId: target.moduleId, taskId: task.id,
        input: { status: 'done', rejectionReason: null },
      });
      toast.success('Tarea aprobada.');
    } catch (caught) {
      toast.error(caught instanceof ApiRequestError ? caught.message :
        'No fue posible aprobar la tarea.');
    }
  };

  const finalize = async (force: boolean) => {
    if (!target || !open || busy || !hasTasks || (!force && warning)) return;
    const start = target.blockStartDate?.slice(0, 10);
    if (!completedOn || completedOn > currentChileDate() || (start && completedOn < start)) {
      setError('La fecha real debe estar entre el inicio del bloque y hoy.');
      return;
    }
    setError('');
    try {
      await updateDelivery.mutateAsync({
        projectId, moduleId: target.moduleId, deliveryId: target.delivery.id,
        input: {
          finalizeBlock: true, completedOn,
          ...(force ? { forceCancelIncompleteTasks: true } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      toast.success(force
        ? 'Entrega registrada y bloque cerrado. Las ' + incompleteTasks.length +
          ' tareas pendientes se cancelaron, conservando sus horas en la bitácora.'
        : 'Entrega registrada. El bloque quedó cerrado y con 100 % de avance.');
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message :
        'No se pudo cerrar el bloque. Revisa los estados de sus tareas.');
    }
  };

  const dateAndEvidence = <div className={styles.fields}>
    <label className={styles.field}>
      <span>Fecha de entrega</span>
      <input type="date" aria-label="Fecha de entrega" value={completedOn}
        min={target?.blockStartDate?.slice(0, 10)} max={currentChileDate()}
        onChange={(event) => { setCompletedOn(event.target.value); setError(''); }} />
    </label>
    <label className={styles.field}>
      <span>Comentario o link de evidencia</span>
      <input aria-label="Comentario o link de evidencia" placeholder="Opcional"
        maxLength={1000} value={comment}
        onChange={(event) => setComment(event.target.value)} />
    </label>
  </div>;

  const taskTable = (rows: readonly ProjectModuleTask[], allowApproval: boolean) =>
    <div className={styles.tableScroll}>
      <table className={styles.taskTable}>
        <thead><tr>
          <th>Tarea</th><th>Colaborador</th><th>Estado</th>
          <th>Inicio</th><th>Fecha límite</th>
          {allowApproval && <th aria-label="Acciones" />}
        </tr></thead>
        <tbody>{rows.map((task) => <tr key={task.id}>
          <td>{task.name}</td>
          <td>{task.assigneeName ?? 'Sin asignar'}</td>
          <td><RoadmapTaskStatusBadges status={task.status}
            assigned={Boolean(task.assigneeUserId)}
            overdue={Boolean(task.date && task.date.slice(0, 10) < currentChileDate())}
            rejectionReason={task.rejectionReason} /></td>
          <td>{dateLabel(task.startDate)}</td>
          <td>{dateLabel(task.date)}</td>
          {allowApproval && <td>{task.status === 'in_review' &&
            <Button size="sm" disabled={busy}
              onClick={() => void approveTask(task)}>Aprobar</Button>}</td>}
        </tr>)}</tbody>
      </table>
    </div>;

  return <>
    <Modal open={Boolean(open && !showForceConfirmation)} wide={warning}
      title={warning ? 'Aún no se puede marcar la entrega' : 'Marcar como entregada'}
      onClose={onClose} dismissible={!busy}
      footer={warning ? <div className={styles.warningFooter}>
        {hasTasks && incompleteTasks.length > 0 &&
          <button type="button" className={styles.forceLink} disabled={busy}
            onClick={() => { setForceConfirm(true); setError(''); }}>
            Marcar como entregada de todas maneras
          </button>}
        <Button variant="outline" disabled={busy} onClick={onClose}>Volver</Button>
      </div> : <>
        <Button variant="outline" disabled={busy} onClick={onClose}>Volver</Button>
        <Button disabled={busy} loading={submitting}
          onClick={() => void finalize(false)}>Marcar como entregada</Button>
      </>}>
      <div className={styles.content}>
        <p className={styles.subtitle}>
          {target?.delivery.name ?? 'Entrega del bloque'}{', del bloque '}
          {target?.blockName ?? target?.delivery.segmentName ?? '—'}.
          {!warning && ' El bloque quedará completo al 100 % en el avance del proyecto.'}
        </p>
        {warning ? <>
          <div className={styles.warningNote} role="status">
            {hasTasks
              ? 'Quedan ' + incompleteTasks.length + ' ' +
                (incompleteTasks.length === 1 ? 'tarea sin terminar' : 'tareas sin terminar') +
                ' en este bloque. Apruébalas, reasígnalas o cancélalas antes de marcar la entrega.'
              : 'Este bloque no tiene tareas operativas. Agrega tareas antes de marcar la entrega.'}
          </div>
          {taskTable(incompleteTasks, true)}
        </> : dateAndEvidence}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
    <Modal open={Boolean(showForceConfirmation)} wide title="Marcar como entregada"
      onClose={() => setForceConfirm(false)} dismissible={!busy}
      footer={<>
        <Button variant="outline" disabled={busy}
          onClick={() => setForceConfirm(false)}>Volver</Button>
        <Button variant="danger" disabled={busy} loading={submitting}
          onClick={() => void finalize(true)}>
          Cancelar {incompleteTasks.length} {incompleteTasks.length === 1 ? 'tarea' : 'tareas'} y marcar como entregada
        </Button>
      </>}>
      <div className={styles.content}>
        <p className={styles.subtitle}>
          {target?.delivery.name ?? 'Entrega del bloque'}{', del bloque '}
          {target?.blockName ?? target?.delivery.segmentName ?? '—'}.
          El bloque quedará completo al 100 % y el cierre constará en la bitácora del proyecto.
        </p>
        {dateAndEvidence}
        <div className={styles.cancelNote} role="alert">
          <strong>Estas {incompleteTasks.length} {incompleteTasks.length === 1 ? 'tarea se cancelará' : 'tareas se cancelarán'}</strong>
          <span>Dejarán de contar en el avance. Las horas registradas se mantienen en la bitácora.</span>
        </div>
        {taskTable(incompleteTasks, false)}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
  </>;
}
