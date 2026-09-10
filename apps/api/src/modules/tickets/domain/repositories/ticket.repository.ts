import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { TicketPriority, TicketStatus } from '@kora/contracts';
import type { Ticket } from '../entities/ticket.entity';

export interface TicketFilters {
  readonly search?: string | undefined;
  readonly clientId?: readonly string[] | undefined;
  readonly projectId?: string | undefined;
  readonly assigneeUserId?: readonly string[] | undefined;
  readonly status?: TicketStatus | undefined;
  readonly priority?: TicketPriority | undefined;
  readonly includeDeleted?: boolean | undefined;
}

export type TicketSortableField = 'createdAt' | 'status' | 'priority';

export interface TicketListItem {
  readonly id: string;
  readonly legacyId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly resolution: string | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  /** Iniciales del líder del proyecto de soporte — "Líder Soporte" en la v1. */
  readonly supportLeaderInitials: string | null;
  readonly developmentProjectId: string | null;
  readonly developmentProjectName: string | null;
  readonly serviceType: string | null;
  readonly priority: string | null;
  readonly status: TicketStatus;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly estimatedHours: number | null;
  readonly usedHours: number;
  /** Solicitudes de HH en estado `pending` para este ticket. */
  readonly pendingHhRequestsCount: number;
  readonly pendingHhHours: number;
  readonly createdAt: Date;
}

export interface TicketRepository {
  findById(id: string, context?: TransactionContext): Promise<Ticket | null>;
  findByLegacyId(legacyId: string, context?: TransactionContext): Promise<Ticket | null>;

  search(
    filters: TicketFilters,
    page: PageRequest,
    sort: SortRequest<TicketSortableField>,
    context?: TransactionContext,
  ): Promise<Page<TicketListItem>>;

  save(ticket: Ticket, context?: TransactionContext): Promise<void>;
}

export const TICKET_REPOSITORY = Symbol('TicketRepository');
