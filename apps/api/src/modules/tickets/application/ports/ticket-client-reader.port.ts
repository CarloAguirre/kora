export interface TicketClientReference {
  readonly id: string;
  readonly companyName: string;
}

export interface TicketClientReader {
  findById(clientId: string): Promise<TicketClientReference | null>;
}

export const TICKET_CLIENT_READER = Symbol('TicketClientReader');
