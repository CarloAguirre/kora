import type { ProjectStatus } from '@kora/contracts';

export interface TicketProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
}

export interface TicketProjectReader {
  findById(projectId: string): Promise<TicketProjectReference | null>;
  /** ¿Es líder del proyecto o líder de algún equipo asignado a él? Autoridad para gestionar sus tickets. */
  isProjectApprover(projectId: string, userId: string): Promise<boolean>;
}

export const TICKET_PROJECT_READER = Symbol('TicketProjectReader');
