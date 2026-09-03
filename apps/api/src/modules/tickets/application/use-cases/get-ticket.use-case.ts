import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import { isAdminTier, type Permission, type RoleCode, type TicketDetail } from '@kora/contracts';
import { TicketNotFoundError } from '../../domain/errors/ticket.errors';
import { TICKET_REPOSITORY, type TicketRepository } from '../../domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY, type TicketHistoryRepository } from '../../domain/repositories/ticket-history.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { TICKET_USER_READER, type TicketUserReader } from '../ports/ticket-user-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toTicketDetail } from '../mappers/ticket.mapper';

export interface GetTicketCommand {
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly actorRole: RoleCode;
  readonly actorPermissions: readonly Permission[];
}

/** Sin `tickets:read`, solo puede ver el ticket si es su responsable — `tickets:read_assigned` da acceso al endpoint, esta verificación decide si a ESTE ticket. */
@Injectable()
export class GetTicketUseCase implements UseCase<GetTicketCommand, TicketDetail, ApplicationError> {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(TICKET_HISTORY_REPOSITORY) private readonly history: TicketHistoryRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(TICKET_USER_READER) private readonly users: TicketUserReader,
  ) {}

  async execute(command: GetTicketCommand): Promise<Result<TicketDetail, ApplicationError>> {
    const ticket = await this.tickets.findById(command.ticketId);
    if (!ticket || ticket.isDeleted) return err(new TicketNotFoundError(command.ticketId));

    if (!command.actorPermissions.includes('tickets:read') && ticket.assigneeUserId !== command.actorUserId) {
      return err(new ForbiddenError('No tienes acceso a este ticket.', 'TICKET_NOT_ASSIGNED'));
    }

    const snapshot = ticket.toSnapshot();
    const isApprover = snapshot.projectId ? await this.projects.isProjectApprover(snapshot.projectId, command.actorUserId) : false;
    const isAssignee = snapshot.assigneeUserId === command.actorUserId;
    const canManage = command.actorPermissions.includes('tickets:manage') || isAssignee || isApprover;
    const canDelete = isAdminTier(command.actorRole) || (command.actorPermissions.includes('tickets:manage') && (isAssignee || isApprover));
    /**
     * Réplica de `canRegisterTicketHH` (v1): a diferencia de `canManage`, NO
     * basta con `tickets:manage` — un admin/PMO que solo supervisa no debe
     * poder cargarse horas de un ticket ajeno. Solo el responsable o quien
     * tiene autoridad real sobre el proyecto, y nunca sobre un ticket cerrado.
     */
    const canRequestHh = Boolean(snapshot.projectId) && (isAssignee || isApprover) && snapshot.status !== 'closed';

    const [client, project, developmentProject, assignee, historyEntries] = await Promise.all([
      snapshot.clientId ? this.clients.findById(snapshot.clientId) : Promise.resolve(null),
      snapshot.projectId ? this.projects.findById(snapshot.projectId) : Promise.resolve(null),
      snapshot.developmentProjectId ? this.projects.findById(snapshot.developmentProjectId) : Promise.resolve(null),
      snapshot.assigneeUserId ? this.users.findById(snapshot.assigneeUserId) : Promise.resolve(null),
      this.history.listForTicket(ticket.id),
    ]);

    return ok(
      toTicketDetail({ ticket, client, project, developmentProject, assignee, history: historyEntries, canManage, canDelete, canRequestHh }),
    );
  }
}
