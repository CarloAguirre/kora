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
  DELIVERY_DISPLAY_STATUS_LABEL, DELIVERY_DISPLAY_STATUS_TONE, deliveryDisplayStatus,
} from '../lib/delivery-status';
import { DeliveryActionDialogs, type DeliveryActionTarget } from './DeliveryActionDialogs';

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value + 'T00:00:00').toLocaleDateString('es-CL') : '—';

type DeliveryFilter = 'all' | 'planned' | 'overdue' | 'completed';

export interface TeamDeliveriesCardProps {
  project: ProjectDetail;
  projectId: string;
  teamId: string;
  /** La vista PM y la del líder utilizan ahora la misma tabla de seis columnas. */
  managerView?: boolean;
}

/** Una entrega de bloque usa finalizeBlock para cerrar a 100% con trazabilidad;
 * una entrega independiente sigue el ciclo normal de envío y aprobación. */
export function TeamDeliveriesCard({ project, projectId, teamId }: TeamDeliveriesCardProps) {
  const [filter, setFilter] = useState<DeliveryFilter>('all');
  const [actionTarget, setActionTarget] = useState<DeliveryActionTarget | null>(null);
  const teamDeliveries = useMemo(() => project.modules.flatMap((module) =>
    module.deliveries.filter((delivery) => delivery.teamId === teamId).map((delivery) => {
      const linkedBlock = module.segments.find((segment) => segment.id === delivery.segmentId);
      return {
        delivery, moduleId: module.id, moduleName: module.name,
        blockName: linkedBlock?.name ?? delivery.segmentName ?? '—',
        blockStartDate: linkedBlock?.startDate,
      };
    })), [project.modules, teamId]);

  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const overdue = (delivery: (typeof teamDeliveries)[number]['delivery']) =>
    delivery.status === 'planned' && Boolean(delivery.estimatedDate) && delivery.estimatedDate < today;
  const completed = (delivery: (typeof teamDeliveries)[number]['delivery']) =>
    delivery.status === 'delivered' || delivery.status === 'approved';
  const matches = (delivery: (typeof teamDeliveries)[number]['delivery'], selected: DeliveryFilter) =>
    selected === 'all' || (selected === 'planned' ? delivery.status === 'planned'
      : selected === 'overdue' ? overdue(delivery) : completed(delivery));
  const { pageItems, pagination } = usePaginatedItems(teamDeliveries.filter(({ delivery }) =>
    matches(delivery, filter)));

  return (
    <>
      <Card>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTitle}>Entregas del equipo</p>
            <p className={styles.deliverySubtitle}>
              Cada bloque de trabajo cierra con una entrega. Al marcarla como entregada,
              el bloque queda al 100% de avance cuando sus tareas están aprobadas.
            </p>
          </div>
        </div>
        <Tabs tabs={[
          { id: 'all', label: 'Todas ' + teamDeliveries.length },
          { id: 'planned', label: 'Planificadas ' + teamDeliveries.filter(({ delivery }) =>
            matches(delivery, 'planned')).length },
          { id: 'overdue', label: 'Vencidas ' + teamDeliveries.filter(({ delivery }) =>
            overdue(delivery)).length },
          { id: 'completed', label: 'Entregadas ' + teamDeliveries.filter(({ delivery }) =>
            completed(delivery)).length },
        ]} activeId={filter} onSelect={(id) => setFilter(id as DeliveryFilter)} />
        <DataTable columns={[
          { key: 'name', header: 'Entrega', render: ({ delivery, moduleName }: (typeof teamDeliveries)[number]) =>
              delivery.name ?? `Entrega de fase: ${moduleName}` },
          { key: 'block', header: 'Bloque de trabajo', render: (item: (typeof teamDeliveries)[number]) =>
              item.blockName },
          { key: 'module', header: 'Módulo', render: (item: (typeof teamDeliveries)[number]) =>
              item.moduleName },
          { key: 'status', header: 'Estado', render: ({ delivery }: (typeof teamDeliveries)[number]) =>
            <Badge tone={delivery.status === 'planned' && overdue(delivery) ? 'danger'
              : DELIVERY_DISPLAY_STATUS_TONE[deliveryDisplayStatus(delivery)]}>
              {delivery.status === 'planned' && overdue(delivery) ? 'Vencida'
                : delivery.status === 'approved' && delivery.completedOn ? 'Entregada'
                  : DELIVERY_DISPLAY_STATUS_LABEL[deliveryDisplayStatus(delivery)]}
            </Badge> },
          { key: 'date', header: 'Fecha objetivo', render: ({ delivery }: (typeof teamDeliveries)[number]) =>
              formatDate(delivery.estimatedDate) },
          { key: 'action', header: '', align: 'right' as const,
            render: (item: (typeof teamDeliveries)[number]) => {
              const { delivery } = item;
              if (!delivery.canManage || delivery.status === 'approved') return null;
              if (delivery.status === 'delivered') return <Button variant="outline" size="sm"
                onClick={() => setActionTarget({ ...item, action: 'approve' })}>
                Aprobar entrega
              </Button>;
              return <Button variant="outline" size="sm"
                title={delivery.segmentId
                  ? 'Cierra el bloque con fecha real; requiere todas las tareas aprobadas.'
                  : 'Envía la entrega a aprobación; el líder debe registrar el motivo.'}
                onClick={() => setActionTarget({
                  ...item, action: delivery.segmentId ? 'finalize' : 'complete',
                })}>
                Marcar como entregada
              </Button>;
            } },
        ]} items={pageItems} getRowKey={(item) => item.delivery.id}
          emptyMessage="Sin entregas en este filtro." />
        <Pagination {...pagination} />
      </Card>
      <DeliveryActionDialogs projectId={projectId}
        members={project.members.filter((member) => !member.blockedAt)}
        target={actionTarget} onClose={() => setActionTarget(null)} />
    </>
  );
}
