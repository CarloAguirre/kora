import type { TicketPriority, TicketServiceType, TicketStatus } from '@kora/contracts';
import { Ticket } from '../../domain/entities/ticket.entity';

export interface TicketRow {
  id: string;
  legacyId: string | null;
  clientId: string | null;
  projectId: string | null;
  developmentProjectId: string | null;
  title: string;
  serviceType: string | null;
  description: string | null;
  evidenceUrl: string | null;
  assigneeUserId: string | null;
  priority: string | null;
  estimatedHours: number | null;
  status: string;
  resolution: string | null;
  resolvedAt: Date | null;
  usedHours: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDomain(row: TicketRow): Ticket {
  return Ticket.restore({
    id: row.id,
    legacyId: row.legacyId,
    clientId: row.clientId,
    projectId: row.projectId,
    developmentProjectId: row.developmentProjectId,
    title: row.title,
    serviceType: row.serviceType as TicketServiceType | null,
    description: row.description,
    evidenceUrl: row.evidenceUrl,
    assigneeUserId: row.assigneeUserId,
    priority: row.priority as TicketPriority | null,
    estimatedHours: row.estimatedHours,
    status: row.status as TicketStatus,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt,
    usedHours: Number(row.usedHours),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toPersistence(ticket: Ticket) {
  const snapshot = ticket.toSnapshot();
  return {
    legacyId: snapshot.legacyId,
    clientId: snapshot.clientId,
    projectId: snapshot.projectId,
    developmentProjectId: snapshot.developmentProjectId,
    title: snapshot.title,
    serviceType: snapshot.serviceType,
    description: snapshot.description,
    evidenceUrl: snapshot.evidenceUrl,
    assigneeUserId: snapshot.assigneeUserId,
    priority: snapshot.priority,
    estimatedHours: snapshot.estimatedHours,
    status: snapshot.status,
    resolution: snapshot.resolution,
    resolvedAt: snapshot.resolvedAt,
    usedHours: String(snapshot.usedHours),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
