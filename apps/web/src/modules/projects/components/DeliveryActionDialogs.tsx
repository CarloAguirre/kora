import { useEffect, useState } from 'react';
import type { ProjectModuleDelivery, ProjectTeamMember } from '@kora/contracts';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import styles from './TeamLeaderProjectView.module.css';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useUpdateProjectModuleDelivery } from '../api/projects.queries';
import { deliveryStatusLabel, type DeliveryAction } from '../lib/delivery-status';
import { ReviewActionModal } from './ReviewActionModal';
import { AssignCollaboratorModal } from './AssignCollaboratorModal';
import { assignableOptions } from '@/modules/users/lib/assignable-options';

export interface DeliveryActionTarget {
  readonly action: DeliveryAction | 'finalize';
  readonly blockName?: string;
  readonly blockStartDate?: string;
  readonly moduleId: string;
  readonly moduleName: string;
  readonly delivery: ProjectModuleDelivery;
}

interface DeliveryActionDialogsProps {
  projectId: string;
  /** Colaboradores del proyecto (`project.members`) — se ofrecen solo los del equipo de la entrega. */
  members: readonly ProjectTeamMember[];
  target: DeliveryActionTarget | null;
  onClose: () => void;
}

const REVIEW_TITLE = {
  complete: 'Marcar entrega como lista',
  approve: 'Aprobar entrega',
  reject: 'Rechazar entrega',
  revert: 'Revertir aprobación',
} as const;

/** El líder la marca terminada sin que el colaborador la haya enviado: el porqué queda en la bitácora. */
const ON_BEHALF_PROMPT = {
  label: 'Motivo',
  placeholder: 'Explica por qué la marcas como lista sin que el colaborador la haya enviado',
  missingMessage: 'Escribe el motivo antes de continuar: queda registrado en la bitácora.',
};

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const localToday = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
};

/**
 * Modales de gestión de una entrega (marcarla terminada en nombre del colaborador, asignar/reasignar,
 * aprobar, rechazar con motivo, revertir una aprobación) — compartidos entre la bitácora (`BitacoraCard`) y "Entregas del equipo"
 * (`TeamDeliveriesCard`), para que el líder de proyecto y el de equipo hagan lo mismo desde donde estén.
 */
export function DeliveryActionDialogs({ projectId, members, target, onClose }: DeliveryActionDialogsProps) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const delivery = target?.delivery;
  const reviewAction = target && target.action !== 'assign' && target.action !== 'finalize'
    ? target.action : null;
  const [completedOn, setCompletedOn] = useState(localToday());
  const [completionComment, setCompletionComment] = useState('');
  const [completionError, setCompletionError] = useState('');
  useEffect(() => {
    if (target?.action === 'finalize') {
      setCompletedOn(localToday());
      setCompletionComment('');
      setCompletionError('');
    }
  }, [target]);

  const summary = delivery
    ? [
        { label: 'Entrega', value: delivery.name ?? `Entrega de fase: ${target.moduleName}` },
        { label: 'Colaborador', value: delivery.assigneeName ?? 'Sin asignar' },
        { label: 'Fase', value: target.moduleName },
        { label: 'Fecha objetivo', value: formatDate(delivery.estimatedDate) },
        { label: 'Estado', value: deliveryStatusLabel(delivery) },
      ]
    : [];

  const onConfirmReview = async (reason?: string) => {
    if (!target || !reviewAction) return;
    const input =
      reviewAction === 'approve'
        ? { status: 'approved' as const, rejectionReason: null }
        : reviewAction === 'reject'
          ? { status: 'planned' as const, rejectionReason: reason ?? '' }
          : reviewAction === 'complete'
            ? { status: 'delivered' as const, rejectionReason: null, comment: reason ?? '' }
            : { status: 'delivered' as const, rejectionReason: null };
    try {
      await updateDelivery.mutateAsync({ projectId, moduleId: target.moduleId, deliveryId: target.delivery.id, input });
      toast.success(
        reviewAction === 'complete'
          ? 'Entrega marcada como lista: queda pendiente de aprobación.'
          : reviewAction === 'approve'
            ? 'Entrega aprobada.'
            : reviewAction === 'reject'
              ? 'Entrega rechazada: vuelve al colaborador.'
              : 'Se revirtió la aprobación: la entrega vuelve a quedar pendiente de aprobación.',
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la entrega.');
    }
  };

  const onConfirmFinalize = async () => {
    if (!target || target.action !== 'finalize') return;
    const start = target.blockStartDate?.slice(0, 10);
    if (!completedOn || completedOn > localToday() || (start && completedOn < start)) {
      setCompletionError('La fecha real debe estar entre el inicio del bloque y hoy.');
      return;
    }
    try {
      await updateDelivery.mutateAsync({
        projectId, moduleId: target.moduleId, deliveryId: target.delivery.id,
        input: {
          finalizeBlock: true, completedOn,
          ...(completionComment.trim() ? { comment: completionComment.trim() } : {}),
        },
      });
      toast.success('Entrega registrada. El bloque quedó cerrado y con 100 % de avance.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message :
        'No se pudo cerrar el bloque. Comprueba que todas sus tareas estén aprobadas.');
    }
  };

  const onConfirmAssign = async (userId: string) => {
    if (!target) return;
    try {
      await updateDelivery.mutateAsync({
        projectId,
        moduleId: target.moduleId,
        deliveryId: target.delivery.id,
        input: { assigneeUserId: userId },
      });
      toast.success(target.delivery.assigneeUserId ? 'Se reasignó la entrega.' : 'Se asignó la entrega.');
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo asignar la entrega.');
    }
  };

  return (
    <>
      <Modal open={target?.action === 'finalize'} title="Marcar como entregada"
        onClose={onClose} dismissible={!updateDelivery.isPending}
        footer={<>
          <Button variant="outline" disabled={updateDelivery.isPending} onClick={onClose}>Cancelar</Button>
          <Button loading={updateDelivery.isPending} onClick={() => void onConfirmFinalize()}>
            Marcar como entregada
          </Button>
        </>}>
        <div className={styles.taskForm}>
          <p><strong>Entrega:</strong> {delivery?.name ?? 'Entrega del bloque'}</p>
          <p><strong>Bloque de trabajo:</strong> {target?.blockName ?? delivery?.segmentName ?? '—'}</p>
          <p className={styles.deliverySubtitle}>
            El cierre registra al líder, la fecha real y la evidencia. La entrega queda aprobada
            y el bloque llega al 100 % cuando todas sus tareas están aprobadas.
          </p>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="delivery-completed-on">
              Fecha real de entrega
            </label>
            <input id="delivery-completed-on" className={styles.deliveryDateInput}
              type="date" value={completedOn} min={target?.blockStartDate?.slice(0, 10)}
              max={localToday()}
              onChange={(event) => { setCompletedOn(event.target.value); setCompletionError(''); }} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="delivery-completion-comment">
              Evidencia o comentario (opcional)
            </label>
            <textarea id="delivery-completion-comment" className={styles.textarea}
              maxLength={1000} value={completionComment}
              onChange={(event) => setCompletionComment(event.target.value)}
              placeholder="Acta de conformidad, enlace o detalle de entrega" />
          </div>
          {completionError && <p role="alert" className={styles.modalError}>{completionError}</p>}
        </div>
      </Modal>
      <ReviewActionModal
        open={reviewAction !== null}
        action={reviewAction === 'complete' || reviewAction === null ? 'approve' : reviewAction}
        title={REVIEW_TITLE[reviewAction ?? 'approve']}
        confirmLabel={
          reviewAction === 'revert' ? 'Revertir aprobación' : reviewAction === 'complete' ? 'Marcar como lista' : undefined
        }
        reasonPrompt={reviewAction === 'complete' ? ON_BEHALF_PROMPT : undefined}
        summary={summary}
        submitting={updateDelivery.isPending}
        onCancel={onClose}
        onConfirm={(reason) => void onConfirmReview(reason)}
      />

      <AssignCollaboratorModal
        open={target?.action === 'assign'}
        isReassign={Boolean(delivery?.assigneeUserId)}
        summary={summary.filter((row) => row.label !== 'Estado')}
        memberOptions={assignableOptions(
          members.filter((member) => member.teamId === delivery?.teamId),
          (member) => ({ value: member.userId, label: member.fullName, status: member.userStatus }),
        )}
        initialUserId={delivery?.assigneeUserId ?? ''}
        submitting={updateDelivery.isPending}
        onCancel={onClose}
        onConfirm={(userId) => void onConfirmAssign(userId)}
      />
    </>
  );
}
