import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ProjectType, TicketLinkableProject } from '@kora/contracts';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListLinkableTicketProjectsQuery {
  readonly clientId: string;
  readonly type: ProjectType;
}

/**
 * Alimenta los selectores "Proyecto" (soporte) y "Proyecto de desarrollo" del
 * modal de ticket. A propósito NO reutiliza `ListProjectsUseCase`: ese caso de
 * uso acota el listado a los proyectos donde el actor participa
 * (`projects:read_assigned`), pero cualquiera con permiso para crear/editar un
 * ticket debe poder vincularlo al proyecto de soporte del cliente aunque no
 * esté asignado a él — esa restricción es para la sección Proyectos, no para
 * elegir a qué proyecto pertenece un ticket.
 */
@Injectable()
export class ListLinkableTicketProjectsUseCase
  implements UseCase<ListLinkableTicketProjectsQuery, TicketLinkableProject[], ApplicationError>
{
  constructor(@Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader) {}

  async execute(query: ListLinkableTicketProjectsQuery): Promise<Result<TicketLinkableProject[], ApplicationError>> {
    const items = await this.projects.findLinkableByClient(query.clientId, query.type);
    return ok(items);
  }
}
