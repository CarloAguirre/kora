import type { TransactionContext } from '@kora/core';
import type { TicketHhRequest, TicketHhRequestStatus } from '../entities/ticket-hh-request.entity';

export interface TicketHhRequestListItem {
  readonly id: string;
  readonly ticketId: string;
  readonly projectId: string;
  readonly projectName: string | null;
  readonly userId: string;
  readonly userFullName: string;
  readonly date: Date;
  readonly hours: number;
  readonly note: string | null;
  readonly isOvertime: boolean;
  readonly status: TicketHhRequestStatus;
  readonly rejectionReason: string | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedByFullName: string | null;
  readonly reviewedAt: Date | null;
  readonly hourEntryId: string | null;
  readonly createdAt: Date;
}

export interface TicketHhRequestRepository {
  findById(id: string, context?: TransactionContext): Promise<TicketHhRequest | null>;
  /** Más recientes primero. */
  listForTicket(ticketId: string, context?: TransactionContext): Promise<TicketHhRequestListItem[]>;
  save(request: TicketHhRequest, context?: TransactionContext): Promise<void>;
}

export const TICKET_HH_REQUEST_REPOSITORY = Symbol('TicketHhRequestRepository');
