import type { UserStatus } from '@kora/contracts';

export interface TicketUserReference {
  readonly id: string;
  readonly fullName: string;
  /** Necesario para decidir si puede recibir el ticket: a un deshabilitado ya no se le asigna. */
  readonly status: UserStatus;
}

export interface TicketUserReader {
  /** Devuelve `null` si la persona fue eliminada — un responsable borrado no existe para el ticket. */
  findById(userId: string): Promise<TicketUserReference | null>;
}

export const TICKET_USER_READER = Symbol('TicketUserReader');
