import { useMemo, useState } from 'react';
import { PROJECT_MODULE_DELIVERY_STATUS_LABELS, type ProjectDetail, type ProjectModuleDeliveryStatus } from '@kora/contracts';
import styles from './TeamLeaderProjectView.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Tabs } from '@/shared/components/ui/Tabs';
import { DataTable } from '@/shared/components/ui/DataTable';
import { useToast } from '@/shared/components/ui/Toast';
import { PencilIcon } from '@/shared/components/icons/Icons';
import { ReviewActionModal, type ReviewAction } from './ReviewActionModal';
import { AssignCollaboratorModal } from './AssignCollaboratorModal';
import { useUpdateProjectModuleDelivery } from '../api/projects.queries';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

const DELIVERY_TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'planned', label: 'Pendientes' },
  { id: 'delivered', label: 'En revisión' },
  { id: 'approved', label: 'Completadas' },
] as const;
type DeliveryFilter = (typeof DELIVERY_TABS)[number]['id'];

const DELIVERY_STATUS_BADGE_CLASS: Record<ProjectModuleDeliveryStatus, string> = {
  planned: 'badgeMuted',
  delivered: 'badgeWarning',
  approved: 'badgeSuccess',
};

export interface TeamDeliveriesCardProps {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}

/**
 * "Entregas del equipo" — el líder asigna cada entrega a un colaborador de su
 * equipo; el colaborador la manda como terminada (`delivered`, desde "Mis
 * entregas" del Dashboard) y recién ahí el líder aprueba, rechaza (con
 * motivo) o revierte una decisión anterior. Mismo patrón que `TeamTasksCard`,
 * compartiendo `ReviewActionModal`. La estructura de las entregas (nombre,
 * fecha objetivo) se crea desde "Crear/editar proyecto", no aquí.
 */
export function TeamDeliveriesCard({ project, projectId, teamId }: TeamDeliveriesCardProps) {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const updateDelivery = useUpdateProjectModuleDelivery();

  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');

  const team = useMemo(() => {
    const teamRow = project.teams.find((t) => t.teamId === teamId);
    const members = project.members.filter((m) => m.teamId === teamId);
    const teamName = teamRow?.teamName ?? members[0]?.teamName ?? 'Equipo';
    const leaderId = teamRow?.leader?.id ?? null;
    return { teamId, teamName, leaderId, members };
  }, [project, teamId]);

  const canManageTeam = can('projects:manage') || (user !== null && team.leaderId === user.id);

  const teamDeliveries = useMemo(() => {
    return project.modules.flatMap((module) =>
      module.deliveries
        .filter((delivery) => delivery.teamId === teamId)
        .map((delivery) => ({ ...delivery, moduleId: module.id, moduleName: module.name })),
    );
  }, [project, teamId]);

  const filteredDeliveries = teamDeliveries.filter((delivery) => deliveryFilter === 'all' || delivery.status === deliveryFilter);

  // Revisar (aprobar/rechazar/revertir) — mismo modal que `TeamTasksCard`.
  const [reviewTarget, setReviewTarget] = useState<{ moduleId: string; deliveryId: string; action: ReviewAction } | null>(null);
  const reviewingDelivery = reviewTarget ? teamDeliveries.find((d) => d.id === reviewTarget.deliveryId) : null;

  const onConfirmReview = async (reason?: string) => {
    if (!reviewTarget || !reviewingDelivery) return;
    const input =
      reviewTarget.action === 'approve'
        ? { status: 'approved' as const, rejectionReason: null }
        : reviewTarget.action === 'reject'
          ? { status: 'planned' as const, rejectionReason: reason ?? '' }
          : { status: 'delivered' as const, rejectionReason: null };
    try {
      await updateDelivery.mutateAsync({ projectId, moduleId: reviewTarget.moduleId, deliveryId: reviewTarget.deliveryId, input });
      toast.success(
        reviewTarget.action === 'approve'
          ? 'Entrega aprobada.'
          : reviewTarget.action === 'reject'
            ? 'Entrega rechazada.'
            : 'Entrega revertida a en revisión.',
      );
      setReviewTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la entrega.');
    }
  };

  // Asignar/reasignar colaborador — solo tiene sentido mientras la entrega no se envió a revisión.
  const [assignTarget, setAssignTarget] = useState<{ moduleId: string; deliveryId: string } | null>(null);
  const assigningDelivery = assignTarget ? teamDeliveries.find((d) => d.id === assignTarget.deliveryId) : null;

  const onConfirmAssign = async (userId: string) => {
    if (!assignTarget) return;
    try {
      await updateDelivery.mutateAsync({
        projectId,
        moduleId: assignTarget.moduleId,
        deliveryId: assignTarget.deliveryId,
        input: { assigneeUserId: userId },
      });
      toast.success('Se asignó la entrega.');
      setAssignTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo asignar la entrega.');
    }
  };

  return (
    <>
      <Card>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Entregas del equipo</p>
        </div>

        <Tabs tabs={[...DELIVERY_TABS]} activeId={deliveryFilter} onSelect={(id) => setDeliveryFilter(id as DeliveryFilter)} />

        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Entrega',
              render: (delivery) => (
                <>
                  {delivery.name ?? 'Entrega'}
                  {delivery.rejectionReason && <span className={styles.rejectionNote}>Rechazada: {delivery.rejectionReason}</span>}
                </>
              ),
            },
            {
              key: 'assignee',
              header: 'Colaborador',
              render: (delivery) => delivery.assigneeName ?? <span style={{ fontStyle: 'italic' }}>Sin asignar</span>,
            },
            { key: 'module', header: 'Módulo', render: (delivery) => delivery.moduleName },
            {
              key: 'status',
              header: 'Estado',
              render: (delivery) => (
                <span className={[styles.badge, styles[DELIVERY_STATUS_BADGE_CLASS[delivery.status]]].join(' ')}>
                  {PROJECT_MODULE_DELIVERY_STATUS_LABELS[delivery.status]}
                </span>
              ),
            },
            { key: 'date', header: 'Fecha objetivo', render: (delivery) => formatDate(delivery.estimatedDate) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (delivery) =>
                canManageTeam ? (
                  <div className={styles.actionsCell}>
                    {delivery.status === 'delivered' ? (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setReviewTarget({ moduleId: delivery.moduleId, deliveryId: delivery.id, action: 'approve' })}
                        >
                          Aprobar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewTarget({ moduleId: delivery.moduleId, deliveryId: delivery.id, action: 'reject' })}
                        >
                          Rechazar
                        </Button>
                      </>
                    ) : delivery.status === 'approved' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar / revertir decisión"
                        aria-label={`Revertir decisión de ${delivery.name ?? 'entrega'}`}
                        onClick={() => setReviewTarget({ moduleId: delivery.moduleId, deliveryId: delivery.id, action: 'revert' })}
                      >
                        <PencilIcon size={14} />
                      </Button>
                    ) : delivery.assigneeUserId == null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignTarget({ moduleId: delivery.moduleId, deliveryId: delivery.id })}
                      >
                        Asignar
                      </Button>
                    ) : (
                      '—'
                    )}
                  </div>
                ) : null,
            },
          ]}
          items={filteredDeliveries}
          getRowKey={(delivery) => delivery.id}
          emptyMessage="Sin entregas en este filtro."
        />
      </Card>

      <ReviewActionModal
        open={reviewTarget !== null}
        action={reviewTarget?.action ?? 'approve'}
        title={
          reviewTarget?.action === 'revert'
            ? 'Editar / revertir decisión — entrega'
            : reviewTarget?.action === 'reject'
              ? 'Rechazar entrega'
              : 'Aprobar entrega'
        }
        summary={
          reviewingDelivery
            ? [
                { label: 'Entrega', value: reviewingDelivery.name ?? 'Entrega' },
                { label: 'Colaborador', value: reviewingDelivery.assigneeName ?? 'Sin asignar' },
                { label: 'Módulo', value: reviewingDelivery.moduleName },
                { label: 'Fecha objetivo', value: formatDate(reviewingDelivery.estimatedDate) },
              ]
            : []
        }
        submitting={updateDelivery.isPending}
        onCancel={() => setReviewTarget(null)}
        onConfirm={(reason) => void onConfirmReview(reason)}
      />

      <AssignCollaboratorModal
        open={assignTarget !== null}
        isReassign={Boolean(assigningDelivery?.assigneeUserId)}
        summary={
          assigningDelivery
            ? [
                { label: 'Entrega', value: assigningDelivery.name ?? 'Entrega' },
                { label: 'Módulo', value: assigningDelivery.moduleName },
                { label: 'Fecha objetivo', value: formatDate(assigningDelivery.estimatedDate) },
              ]
            : []
        }
        memberOptions={team.members.map((m) => ({ value: m.userId, label: m.fullName }))}
        initialUserId={assigningDelivery?.assigneeUserId ?? ''}
        submitting={updateDelivery.isPending}
        onCancel={() => setAssignTarget(null)}
        onConfirm={(userId) => void onConfirmAssign(userId)}
      />
    </>
  );
}
