export interface TicketCodeGenerator {
  /** Siguiente código visible (`TK-0001`) — ver `tickets_code_seq` en @kora/db. */
  next(): Promise<string>;
}

export const TICKET_CODE_GENERATOR = Symbol('TicketCodeGenerator');
