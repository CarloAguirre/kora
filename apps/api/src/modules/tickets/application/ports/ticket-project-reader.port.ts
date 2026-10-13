import type { ProjectStatus, ProjectType } from '@kora/contracts';

export interface TicketProjectReference {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly type: ProjectType;
  readonly clientId: string | null;
}

export interface LinkableProjectReference {
  readonly id: string;
  readonly name: string;
}

export interface TicketProjectReader {
  findById(projectId: string): Promise<TicketProjectReference | null>;
  /** Para validar los proyectos que un contrato de soporte pretende cubrir (`CreateSupportPlanUseCase`): deben ser de desarrollo, estar terminados, y del mismo cliente. */
  findManyByIds(projectIds: readonly string[]): Promise<TicketProjectReference[]>;
  /**
   * Proyectos de `type` que pertenecen a `clientId`, para poblar el selector
   * de proyecto al crear/editar un ticket. Sin acotar por asignación: a
   * diferencia de `GET /projects` (ver `ListProjectsUseCase`), aquí cualquier
   * actor con `tickets:create`/`tickets:manage` debe ver TODOS los proyectos
   * de soporte del cliente, esté o no asignado a ellos — de lo contrario un
   * colaborador no staffeado en el proyecto de soporte de un cliente no podría
   * nunca abrirle un ticket. `status` acota además por estado.
   */
  findLinkableByClient(clientId: string, type: ProjectType, status?: readonly ProjectStatus[]): Promise<LinkableProjectReference[]>;
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
  /** Enumerado de `isProjectApprover` — quién(es) decidirían una solicitud de HH de `assigneeUserId` en este proyecto, para mostrarlo al enviarla. */
  findHhApprovers(projectId: string, assigneeUserId: string | null): Promise<{ id: string; fullName: string }[]>;
}

export const TICKET_PROJECT_READER = Symbol('TicketProjectReader');
