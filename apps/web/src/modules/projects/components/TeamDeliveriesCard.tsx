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
  /** Solo vista PMO/PM: resumen compacto según prototipo sin cambiar la del líder de equipo. */
  managerView?: boolean;
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
export function TeamDeliveriesCard({ project, projectId, teamId, managerView = false }: TeamDeliveriesCardProps) {
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [managerFilter, setManagerFilter] = useState<'all' | 'planned' | 'overdue' | 'completed'>('all');
  const [actionTarget, setActionTarget] = useState<DeliveryActionTarget | null>(null);

  const teamDeliveries = useMemo(() => {
    return project.modules.flatMap((module) =>
      module.deliveries
        .filter((delivery) => delivery.teamId === teamId)
        .map((delivery) => ({
          delivery, moduleId: module.id, moduleName: module.name,
          blockName: module.segments.find((segment) => segment.id === delivery.segmentId)?.name ??
            module.segments.find((segment) => segment.teamId === teamId)?.name ?? '—',
        })),
    );
  }, [project, teamId]);

  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const overdue = (delivery: (typeof teamDeliveries)[number]['delivery']) =>
    delivery.status === 'planned' && delivery.estimatedDate < today;
  const matchesManagerFilter = (delivery: (typeof teamDeliveries)[number]['delivery'],
    filter: typeof managerFilter) =>
    filter === 'all' || (filter === 'planned' ? delivery.status === 'planned' :
      filter === 'overdue' ? overdue(delivery) : delivery.status !== 'planned');
  const filteredDeliveries = teamDeliveries.filter(({ delivery }) =>
    managerView ? matchesManagerFilter(delivery, managerFilter) :
      deliveryFilter === 'all' || deliveryDisplayStatus(delivery) === deliveryFilter);
  const { pageItems, pagination } = usePaginatedItems(filteredDeliveries);

  return (
    <>
      <Card>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Entregas del equipo</p>
        </div>

        {managerView ? <Tabs tabs={[
          { id: 'all', label: 'Todas ' + teamDeliveries.length },
          { id: 'planned', label: 'Planificadas ' + teamDeliveries.filter((d) => matchesManagerFilter(d.delivery, 'planned')).length },
          { id: 'overdue', label: 'Vencidas ' + teamDeliveries.filter((d) => overdue(d.delivery)).length },
          { id: 'completed', label: 'Entregadas ' + teamDeliveries.filter((d) => matchesManagerFilter(d.delivery, 'completed')).length },
        ]} activeId={managerFilter} onSelect={(id) => setManagerFilter(id as typeof managerFilter)} />
          : <Tabs tabs={[...DELIVERY_TABS]} activeId={deliveryFilter} onSelect={(id) => setDeliveryFilter(id as DeliveryFilter)} />}

        {managerView ? <DataTable columns={[
          { key: 'name', header: 'Entrega', render: ({ delivery, moduleName }: (typeof teamDeliveries)[number]) =>
              delivery.name ?? `Entrega de fase: ${moduleName}` },
          { key: 'block', header: 'Bloque de trabajo', render: (item: (typeof teamDeliveries)[number]) => item.blockName },
          { key: 'module', header: 'Módulo', render: (item: (typeof teamDeliveries)[number]) => item.moduleName },
          { key: 'status', header: 'Estado', render: ({ delivery }: (typeof teamDeliveries)[number]) => <Badge
              tone={delivery.status === 'planned' && overdue(delivery) ? 'danger' :
                DELIVERY_DISPLAY_STATUS_TONE[deliveryDisplayStatus(delivery)]}>
              {delivery.status === 'planned' && overdue(delivery) ? 'Vencida' :
                DELIVERY_DISPLAY_STATUS_LABEL[deliveryDisplayStatus(delivery)]}
            </Badge> },
          { key: 'date', header: 'Fecha objetivo', render: ({ delivery }: (typeof teamDeliveries)[number]) =>
              formatDate(delivery.estimatedDate) },
          { key: 'action', header: '', align: 'right' as const, render: (item: (typeof teamDeliveries)[number]) => {
            const { delivery } = item;
            if (!delivery.canManage) return null;
            if (delivery.status === 'approved') return <span>Aprobada</span>;
            if (delivery.status === 'delivered') return <Button variant="outline" size="sm"
              onClick={() => setActionTarget({ ...item, action: 'approve' })}>Aprobar entrega</Button>;
            return <Button variant="outline" size="sm"
              title={delivery.assigneeUserId ? 'Marcar como terminada para aprobación' : 'Primero asigna un colaborador a la entrega'}
              onClick={() => setActionTarget({ ...item,
                action: delivery.assigneeUserId ? 'complete' : 'assign',
              })}>{delivery.assigneeUserId ? 'Marcar como entregada' : 'Asignar responsable'}</Button>;
          } },
        ]} items={pageItems} getRowKey={(item) => item.delivery.id}
          emptyMessage="Sin entregas en este filtro." />
        : <DataTable
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
        />}

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
