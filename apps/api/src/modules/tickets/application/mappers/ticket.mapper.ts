import type { TicketDetail, TicketServiceType, TicketSummary } from '@kora/contracts';
import type { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketListItem } from '../../domain/repositories/ticket.repository';
import type { TicketHistoryEntryRecord } from '../../domain/repositories/ticket-history.repository';
import type { TicketClientReference } from '../ports/ticket-client-reader.port';
import type { TicketProjectReference } from '../ports/ticket-project-reader.port';

/**
 * Código visible — réplica de `getSupportTicketDisplayCode` (v1): la v1 nunca
 * mostraba `id_ticket` tal cual, lo formateaba como `IN0879`/`ME0886` (mejora
 * vs el resto) a partir de sus dígitos + el tipo de servicio. `legacyId` en
 * v2 guarda el valor crudo (clave de upsert idempotente en cada reimportación)
 * — este es el único lugar que lo traduce al código que la gente reconoce.
 */
function formatTicketCode(legacyId: string | null, serviceType: TicketServiceType | null): string | null {
  if (!legacyId) return null;
  const digits = legacyId.replace(/\D/g, '').padStart(4, '0');
  return serviceType === 'improvement' ? `ME${digits}` : `IN${digits}`;
}

export function toTicketSummary(item: TicketListItem): TicketSummary {
  const serviceType = item.serviceType as TicketSummary['serviceType'];
  return {
    id: item.id,
    code: formatTicketCode(item.legacyId, serviceType),
    title: item.title,
    description: item.description,
    resolution: item.resolution,
    client: item.clientId ? { id: item.clientId, companyName: item.clientName ?? '' } : null,
    project: item.projectId ? { id: item.projectId, name: item.projectName ?? '' } : null,
    supportLeaderInitials: item.supportLeaderInitials,
    developmentProject: item.developmentProjectId
      ? { id: item.developmentProjectId, name: item.developmentProjectName ?? '' }
      : null,
    serviceType,
    priority: item.priority as TicketSummary['priority'],
    status: item.status,
    assignee: item.assigneeUserId ? { id: item.assigneeUserId, fullName: item.assigneeName ?? '' } : null,
    estimatedHours: item.estimatedHours,
    usedHours: item.usedHours,
    pendingHhRequestsCount: item.pendingHhRequestsCount,
    pendingHhHours: item.pendingHhHours,
    createdAt: item.createdAt.toISOString(),
  };
}

export interface TicketDetailSource {
  readonly ticket: Ticket;
  readonly client: TicketClientReference | null;
  readonly project: TicketProjectReference | null;
  readonly developmentProject: TicketProjectReference | null;
  readonly assignee: { id: string; fullName: string } | null;
  readonly history: readonly TicketHistoryEntryRecord[];
  readonly canManage: boolean;
  readonly canDelete: boolean;
  readonly canRequestHh: boolean;
  readonly canAuthorizeOvertime: boolean;
  readonly pendingHhRequestsCount: number;
  readonly pendingHhHours: number;
}

export function toTicketDetail(source: TicketDetailSource): TicketDetail {
  const snapshot = source.ticket.toSnapshot();

  return {
    id: snapshot.id,
    code: formatTicketCode(snapshot.legacyId, snapshot.serviceType),
    title: snapshot.title,
    client: snapshot.clientId ? { id: snapshot.clientId, companyName: source.client?.companyName ?? '' } : null,
    project: snapshot.projectId ? { id: snapshot.projectId, name: source.project?.name ?? '' } : null,
    // El modal de detalle no trae al líder del proyecto de soporte —
    // "Líder Soporte" solo existe hoy en el listado/export (ver
    // DrizzleTicketRepository.search). Ampliar TicketProjectReader para
    // incluirlo aquí también es trabajo aparte si se necesita en el modal.
    supportLeaderInitials: null,
    developmentProject: snapshot.developmentProjectId
      ? { id: snapshot.developmentProjectId, name: source.developmentProject?.name ?? '' }
      : null,
    serviceType: snapshot.serviceType,
    priority: snapshot.priority,
    status: snapshot.status,
    assignee: snapshot.assigneeUserId ? { id: snapshot.assigneeUserId, fullName: source.assignee?.fullName ?? '' } : null,
    estimatedHours: snapshot.estimatedHours,
    usedHours: snapshot.usedHours,
    pendingHhRequestsCount: source.pendingHhRequestsCount,
    pendingHhHours: source.pendingHhHours,
    description: snapshot.description,
    evidenceUrl: snapshot.evidenceUrl,
    resolution: snapshot.resolution,
    resolvedAt: snapshot.resolvedAt?.toISOString() ?? null,
    history: source.history.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      description: entry.description,
      metadata: entry.metadata,
      actorName: entry.actorName,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    canManage: source.canManage,
    canDelete: source.canDelete,
    canRequestHh: source.canRequestHh,
    allowsOvertime: snapshot.allowsOvertime,
    canAuthorizeOvertime: source.canAuthorizeOvertime,
  };
}
