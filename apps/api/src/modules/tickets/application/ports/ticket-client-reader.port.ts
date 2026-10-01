export interface TicketClientContactReference {
  readonly id: string;
  readonly name: string;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface TicketClientReference {
  readonly id: string;
  readonly companyName: string;
  readonly primaryContact: TicketClientContactReference | null;
}

export interface TicketClientReader {
  findById(clientId: string): Promise<TicketClientReference | null>;
  /** Nombre de varios clientes en una sola consulta (sin el contacto de `findById`) — los ids que no existen no vienen en el mapa. */
  findCompanyNames(clientIds: readonly string[]): Promise<Map<string, string>>;
  /** Para validar y mostrar el override de contacto de un contrato de soporte (`support_plans.primary_contact_id`) — el contacto debe pertenecer a `clientId`. */
  findContact(clientId: string, contactId: string): Promise<TicketClientContactReference | null>;
}

export const TICKET_CLIENT_READER = Symbol('TicketClientReader');
