import type { TransactionContext } from '@kora/core';

export interface TicketHistoryEntryRecord {
  readonly id: string;
  readonly ticketId: string;
  readonly eventType: string;
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly occurredAt: Date;
}

export interface AppendTicketHistoryEntry {
  readonly ticketId: string;
  readonly eventType: string;
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
  readonly actorUserId: string | null;
  readonly occurredAt: Date;
}

/**
 * Bitácora de tickets. Es de solo apéndice — nada la actualiza ni la borra —
 * así que el puerto no tiene más que "agregar" y "listar".
 */
export interface TicketHistoryRepository {
  append(entry: AppendTicketHistoryEntry, context?: TransactionContext): Promise<void>;
  listForTicket(ticketId: string, context?: TransactionContext): Promise<TicketHistoryEntryRecord[]>;
}

export const TICKET_HISTORY_REPOSITORY = Symbol('TicketHistoryRepository');
