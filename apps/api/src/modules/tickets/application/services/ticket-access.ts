import type { Permission } from '@kora/contracts';
import type { Ticket } from '../../domain/entities/ticket.entity';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';

/**
 * Replica `canModifyTicket` de la v1: la autorización sobre UN ticket no
 * depende solo del rol. Un actor con `tickets:manage` siempre puede; sin ese
 * permiso, igual puede si es el responsable del ticket o tiene autoridad
 * sobre su proyecto — EXCLUYENTE por responsable, mismo criterio que Horas
 * (ver `TicketProjectReader.isProjectApprover` / docs/DECISION-M4-HORAS.md):
 * si el responsable tiene líder de equipo, solo ese líder gestiona; si no,
 * el líder del proyecto.
 */
export async function canManageTicket(
  ticket: Pick<Ticket, 'projectId' | 'assigneeUserId'>,
  actorUserId: string,
  actorPermissions: readonly Permission[],
  projects: TicketProjectReader,
): Promise<boolean> {
  if (actorPermissions.includes('tickets:manage')) return true;
  if (ticket.assigneeUserId === actorUserId) return true;
  if (ticket.projectId) return projects.isProjectApprover(ticket.projectId, actorUserId, ticket.assigneeUserId);
  return false;
}
