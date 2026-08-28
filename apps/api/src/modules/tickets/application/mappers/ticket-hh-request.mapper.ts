import type { TicketHhRequest as TicketHhRequestDto } from '@kora/contracts';
import type { TicketHhRequestListItem } from '../../domain/repositories/ticket-hh-request.repository';

export function toTicketHhRequestDto(item: TicketHhRequestListItem): TicketHhRequestDto {
  return {
    id: item.id,
    ticketId: item.ticketId,
    project: { id: item.projectId, name: item.projectName ?? '' },
    user: { id: item.userId, fullName: item.userFullName },
    date: item.date.toISOString().slice(0, 10),
    hours: item.hours,
    note: item.note,
    status: item.status,
    rejectionReason: item.rejectionReason,
    reviewedBy: item.reviewedByUserId ? { id: item.reviewedByUserId, fullName: item.reviewedByFullName ?? '' } : null,
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    hourEntryId: item.hourEntryId,
    createdAt: item.createdAt.toISOString(),
  };
}
