import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission, RoleCode, TicketHhRequest as TicketHhRequestDto } from '@kora/contracts';
import { TICKET_HH_REQUEST_REPOSITORY, type TicketHhRequestRepository } from '../../domain/repositories/ticket-hh-request.repository';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { toTicketHhRequestDto } from '../mappers/ticket-hh-request.mapper';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListTicketHhRequestsCommand {
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly actorRole: RoleCode;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class ListTicketHhRequestsUseCase implements UseCase<ListTicketHhRequestsCommand, TicketHhRequestDto[], ApplicationError> {
  constructor(
    @Inject(TICKET_HH_REQUEST_REPOSITORY) private readonly requests: TicketHhRequestRepository,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
  ) {}

  async execute(command: ListTicketHhRequestsCommand): Promise<Result<TicketHhRequestDto[], ApplicationError>> {
    const items = await this.requests.listForTicket(command.ticketId);

    /**
     * Réplica de la autorización de `ApproveTicketHhRequestUseCase`/`RejectTicketHhRequestUseCase`
     * para que la ficha no ofrezca Aprobar/Rechazar a quien el backend se lo va a negar — p.ej. el
     * líder del proyecto cuando el autor tiene líder de equipo asignado (regla EXCLUYENTE, ver
     * `isProjectLeaderOrTeamLeaderOfMember`). Memoizado por proyecto+autor: un ticket suele tener
     * varias solicitudes de la misma persona.
     */
    const approverChecks = new Map<string, Promise<boolean>>();
    const canReview = (projectId: string, userId: string): Promise<boolean> => {
      if (!command.actorPermissions.includes('hours:approve')) return Promise.resolve(false);
      if (userId === command.actorUserId) return Promise.resolve(false);
      if (command.actorRole === 'admin' || command.actorRole === 'pmo') return Promise.resolve(true);
      const key = `${projectId}:${userId}`;
      let check = approverChecks.get(key);
      if (!check) {
        check = this.projects.isProjectApprover(projectId, command.actorUserId, userId);
        approverChecks.set(key, check);
      }
      return check;
    };

    const dtos = await Promise.all(
      items.map(async (item) =>
        toTicketHhRequestDto(item, item.status === 'pending' ? await canReview(item.projectId, item.userId) : false),
      ),
    );
    return ok(dtos);
  }
}
