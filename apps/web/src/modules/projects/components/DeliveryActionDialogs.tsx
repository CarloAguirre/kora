import type { ProjectModuleDelivery, ProjectTeamMember } from '@kora/contracts';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { useUpdateProjectModuleDelivery } from '../api/projects.queries';
import { deliveryStatusLabel, type DeliveryAction } from '../lib/delivery-status';
import { ReviewActionModal } from './ReviewActionModal';
import { AssignCollaboratorModal } from './AssignCollaboratorModal';

export interface DeliveryActionTarget {
  readonly action: DeliveryAction;
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
  complete: 'Marcar entrega como terminada',
  approve: 'Aprobar entrega',
  reject: 'Rechazar entrega',
  revert: 'Revertir aprobación',
} as const;

/** El líder la marca terminada sin que el colaborador la haya enviado: el porqué queda en la bitácora. */
const ON_BEHALF_PROMPT = {
  label: 'Motivo',
  placeholder: 'Explica por qué la marcas como terminada sin que el colaborador la haya enviado',
  missingMessage: 'Escribe el motivo antes de continuar: queda registrado en la bitácora.',
};

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

/**
 * Modales de gestión de una entrega (marcarla terminada en nombre del colaborador, asignar/reasignar,
 * aprobar, rechazar con motivo, revertir una aprobación) — compartidos entre la bitácora (`BitacoraCard`) y "Entregas del equipo"
 * (`TeamDeliveriesCard`), para que el líder de proyecto y el de equipo hagan lo mismo desde donde estén.
 */
export function DeliveryActionDialogs({ projectId, members, target, onClose }: DeliveryActionDialogsProps) {
  const toast = useToast();
  const updateDelivery = useUpdateProjectModuleDelivery();
  const delivery = target?.delivery;
  const reviewAction = target && target.action !== 'assign' ? target.action : null;

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
          ? 'Entrega marcada como terminada: queda pendiente de aprobación.'
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
      <ReviewActionModal
        open={reviewAction !== null}
        action={reviewAction === 'complete' || reviewAction === null ? 'approve' : reviewAction}
        title={REVIEW_TITLE[reviewAction ?? 'approve']}
        confirmLabel={
          reviewAction === 'revert' ? 'Revertir aprobación' : reviewAction === 'complete' ? 'Marcar como terminada' : undefined
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
        memberOptions={members
          .filter((member) => member.teamId === delivery?.teamId)
          .map((member) => ({ value: member.userId, label: member.fullName }))}
        initialUserId={delivery?.assigneeUserId ?? ''}
        submitting={updateDelivery.isPending}
        onCancel={onClose}
        onConfirm={(userId) => void onConfirmAssign(userId)}
      />
    </>
  );
}
