import { useMemo, useState } from 'react';
import type { ProjectDetail } from '@kora/contracts';
import styles from './TeamLeaderProjectView.module.css';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Tabs } from '@/shared/components/ui/Tabs';
import { DataTable } from '@/shared/components/ui/DataTable';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import {
  DELIVERY_DISPLAY_STATUS_LABEL,
  DELIVERY_DISPLAY_STATUS_TONE,
  deliveryActionLabel,
  deliveryActions,
  deliveryDisplayStatus,
  type DeliveryDisplayStatus,
} from '../lib/delivery-status';
import { DeliveryActionDialogs, type DeliveryActionTarget } from './DeliveryActionDialogs';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

const DELIVERY_TABS: ReadonlyArray<{ id: 'all' | DeliveryDisplayStatus; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'planned', label: 'Planificadas' },
  { id: 'delivered', label: 'Pendientes de aprobación' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'approved', label: 'Aprobadas' },
];
type DeliveryFilter = (typeof DELIVERY_TABS)[number]['id'];

export interface TeamDeliveriesCardProps {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
}

/**
 * "Entregas del equipo" — el líder asigna cada entrega a un colaborador de su
 * equipo; el colaborador la marca como terminada (`delivered`, "Pendiente de
 * aprobación", desde "Mis entregas" del Dashboard) y recién ahí el líder
 * aprueba, rechaza (con motivo) o revierte una aprobación. Mismos modales y
 * reglas que el menú de la bitácora (`DeliveryActionDialogs`/`deliveryActions`).
 * La estructura de las entregas (nombre, fecha objetivo) se crea desde
 * "Crear/editar proyecto", no aquí.
 */
export function TeamDeliveriesCard({ project, projectId, teamId }: TeamDeliveriesCardProps) {
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [actionTarget, setActionTarget] = useState<DeliveryActionTarget | null>(null);

  const teamDeliveries = useMemo(() => {
    return project.modules.flatMap((module) =>
      module.deliveries
        .filter((delivery) => delivery.teamId === teamId)
        .map((delivery) => ({ delivery, moduleId: module.id, moduleName: module.name })),
    );
  }, [project, teamId]);

  const filteredDeliveries = teamDeliveries.filter(
    ({ delivery }) => deliveryFilter === 'all' || deliveryDisplayStatus(delivery) === deliveryFilter,
  );
  const { pageItems, pagination } = usePaginatedItems(filteredDeliveries);

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
              render: ({ delivery, moduleName }) => (
                <>
                  {delivery.name ?? `Entrega de fase: ${moduleName}`}
                  {delivery.rejectionReason && <span className={styles.rejectionNote}>Rechazada: {delivery.rejectionReason}</span>}
                </>
              ),
            },
            {
              key: 'assignee',
              header: 'Colaborador',
              render: ({ delivery }) => delivery.assigneeName ?? <span style={{ fontStyle: 'italic' }}>Sin asignar</span>,
            },
            { key: 'module', header: 'Módulo', render: ({ moduleName }) => moduleName },
            {
              key: 'status',
              header: 'Estado',
              render: ({ delivery }) => {
                const status = deliveryDisplayStatus(delivery);
                return <Badge tone={DELIVERY_DISPLAY_STATUS_TONE[status]}>{DELIVERY_DISPLAY_STATUS_LABEL[status]}</Badge>;
              },
            },
            { key: 'date', header: 'Fecha objetivo', render: ({ delivery }) => formatDate(delivery.estimatedDate) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (item) => {
                const actions = deliveryActions(item.delivery);
                if (!item.delivery.canManage) return null;
                if (actions.length === 0) return '—';
                return (
                  <div className={styles.actionsCell}>
                    {actions.map((action) => (
                      <Button
                        key={action}
                        variant={action === 'approve' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setActionTarget({ action, ...item })}
                      >
                        {deliveryActionLabel(action, item.delivery)}
                      </Button>
                    ))}
                  </div>
                );
              },
            },
          ]}
          items={pageItems}
          getRowKey={({ delivery }) => delivery.id}
          emptyMessage="Sin entregas en este filtro."
        />

        <Pagination {...pagination} />
      </Card>

      <DeliveryActionDialogs
        projectId={projectId}
        members={project.members}
        target={actionTarget}
        onClose={() => setActionTarget(null)}
      />
    </>
  );
}
