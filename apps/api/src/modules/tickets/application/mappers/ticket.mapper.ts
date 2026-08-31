import type { TicketDetail, TicketSummary } from '@kora/contracts';
import type { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketListItem } from '../../domain/repositories/ticket.repository';
import type { TicketHistoryEntryRecord } from '../../domain/repositories/ticket-history.repository';
import type { TicketClientReference } from '../ports/ticket-client-reader.port';
import type { TicketProjectReference } from '../ports/ticket-project-reader.port';

export function toTicketSummary(item: TicketListItem): TicketSummary {
  return {
    id: item.id,
    code: item.legacyId,
    title: item.title,
    client: item.clientId ? { id: item.clientId, companyName: item.clientName ?? '' } : null,
    project: item.projectId ? { id: item.projectId, name: item.projectName ?? '' } : null,
    serviceType: item.serviceType as TicketSummary['serviceType'],
    priority: item.priority as TicketSummary['priority'],
    status: item.status,
    assignee: item.assigneeUserId ? { id: item.assigneeUserId, fullName: item.assigneeName ?? '' } : null,
    estimatedHours: item.estimatedHours,
    usedHours: item.usedHours,
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
}

export function toTicketDetail(source: TicketDetailSource): TicketDetail {
  const snapshot = source.ticket.toSnapshot();

  return {
    id: snapshot.id,
    code: snapshot.legacyId,
    title: snapshot.title,
    client: snapshot.clientId ? { id: snapshot.clientId, companyName: source.client?.companyName ?? '' } : null,
    project: snapshot.projectId ? { id: snapshot.projectId, name: source.project?.name ?? '' } : null,
    developmentProject: snapshot.developmentProjectId
      ? { id: snapshot.developmentProjectId, name: source.developmentProject?.name ?? '' }
      : null,
    serviceType: snapshot.serviceType,
    priority: snapshot.priority,
    status: snapshot.status,
    assignee: snapshot.assigneeUserId ? { id: snapshot.assigneeUserId, fullName: source.assignee?.fullName ?? '' } : null,
    estimatedHours: snapshot.estimatedHours,
    usedHours: snapshot.usedHours,
    description: snapshot.description,
    evidenceUrl: snapshot.evidenceUrl,
    resolution: snapshot.resolution,
    resolvedAt: snapshot.resolvedAt?.toISOString() ?? null,
    history: source.history.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      description: entry.description,
      actorName: entry.actorName,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    legacyId: snapshot.legacyId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    canManage: source.canManage,
    canDelete: source.canDelete,
  };
}
