export interface TicketUserReference {
  readonly id: string;
  readonly fullName: string;
}

export interface TicketUserReader {
  findById(userId: string): Promise<TicketUserReference | null>;
}

export const TICKET_USER_READER = Symbol('TicketUserReader');
