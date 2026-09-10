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
  /**
   * Horas PENDIENTES que `userId` ya tiene solicitadas para `date`, en
   * CUALQUIER ticket — alimenta el tope diario de 8h al crear una nueva
   * solicitud (ver `CreateTicketHhRequestUseCase`). Solo `pending`: una
   * solicitud `approved` ya generó su propio `hour_entries` (ver
   * `buildApprovedHourEntry`), que `HourEntryRepository.sumHoursForUserAndDate`
   * cuenta aparte — sumar ambas la contaría dos veces.
   */
  sumHoursForUserAndDate(userId: string, date: Date, context?: TransactionContext): Promise<number>;
  save(request: TicketHhRequest, context?: TransactionContext): Promise<void>;
}

export const TICKET_HH_REQUEST_REPOSITORY = Symbol('TicketHhRequestRepository');
