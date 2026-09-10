import { TicketHhRequest, type TicketHhRequestStatus } from '../../domain/entities/ticket-hh-request.entity';

export interface TicketHhRequestRow {
  id: string;
  ticketId: string;
  projectId: string;
  userId: string;
  date: Date;
  hours: string;
  note: string | null;
  isOvertime: boolean;
  status: string;
  rejectionReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  hourEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDomain(row: TicketHhRequestRow): TicketHhRequest {
  return TicketHhRequest.restore({
    id: row.id,
    ticketId: row.ticketId,
    projectId: row.projectId,
    userId: row.userId,
    date: row.date,
    hours: Number(row.hours),
    note: row.note,
    isOvertime: row.isOvertime,
    status: row.status as TicketHhRequestStatus,
    rejectionReason: row.rejectionReason,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    hourEntryId: row.hourEntryId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPersistence(request: TicketHhRequest) {
  const snapshot = request.toSnapshot();
  return {
    ticketId: snapshot.ticketId,
    projectId: snapshot.projectId,
    userId: snapshot.userId,
    date: snapshot.date,
    hours: String(snapshot.hours),
    note: snapshot.note,
    isOvertime: snapshot.isOvertime,
    status: snapshot.status,
    rejectionReason: snapshot.rejectionReason,
    reviewedByUserId: snapshot.reviewedByUserId,
    reviewedAt: snapshot.reviewedAt,
    hourEntryId: snapshot.hourEntryId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
