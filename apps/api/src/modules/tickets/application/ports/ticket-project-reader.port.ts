import type { ProjectStatus } from '@kora/contracts';

export interface TicketProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
}

export interface TicketProjectReader {
  findById(projectId: string): Promise<TicketProjectReference | null>;
  /**
   * ¿Puede `actorUserId` gestionar el ticket de `assigneeUserId` en este
   * proyecto? EXCLUYENTE, mismo criterio que Horas (ver
   * docs/DECISION-M4-HORAS.md): si el responsable tiene líder de equipo
   * resoluble para este proyecto, SOLO ese líder tiene autoridad — el líder
   * del proyecto la recupera únicamente cuando no hay líder de equipo
   * resoluble, incluido un ticket sin responsable (`assigneeUserId: null`).
   * Ya no es "¿lidera este proyecto en general?" — antes no distinguía de
   * qué equipo era el responsable, así que un líder de un equipo AJENO al
   * responsable (pero también asignado al mismo proyecto) podía gestionar el
   * ticket igual que su propio líder.
   */
  isProjectApprover(projectId: string, actorUserId: string, assigneeUserId: string | null): Promise<boolean>;
}

export const TICKET_PROJECT_READER = Symbol('TicketProjectReader');
