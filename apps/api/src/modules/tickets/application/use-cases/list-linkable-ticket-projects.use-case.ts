import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ProjectType, TicketLinkableProject } from '@kora/contracts';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListLinkableTicketProjectsQuery {
  readonly clientId: string;
  readonly type: ProjectType;
  readonly supportProjectId?: string;
}

/**
 * Alimenta los selectores "Proyecto" (soporte) y "Proyecto de desarrollo" del
 * modal de ticket. A propósito NO reutiliza `ListProjectsUseCase`: ese caso de
 * uso acota el listado a los proyectos donde el actor participa
 * (`projects:read_assigned`), pero cualquiera con permiso para crear/editar un
 * ticket debe poder vincularlo al proyecto de soporte del cliente aunque no
 * esté asignado a él — esa restricción es para la sección Proyectos, no para
 * elegir a qué proyecto pertenece un ticket.
 *
 * Con `supportProjectId` (el contrato elegido), los de desarrollo se acotan a
 * los que ese contrato cubre. Un contrato legado, sin enlaces en
 * `support_plan_projects`, no tiene cómo acotarlos: cae al listado completo
 * del cliente, como antes.
 */
@Injectable()
export class ListLinkableTicketProjectsUseCase
  implements UseCase<ListLinkableTicketProjectsQuery, TicketLinkableProject[], ApplicationError>
{
  constructor(
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
  ) {}

  async execute(query: ListLinkableTicketProjectsQuery): Promise<Result<TicketLinkableProject[], ApplicationError>> {
    const items = await this.projects.findLinkableByClient(query.clientId, query.type);
    if (query.type !== 'development' || !query.supportProjectId) return ok(items);

    const coveredIds = await this.coveredProjectIds(query.supportProjectId);
    if (coveredIds.length === 0) return ok(items);
    const covered = new Set(coveredIds);
    return ok(items.filter((item) => covered.has(item.id)));
  }

  private async coveredProjectIds(supportProjectId: string): Promise<string[]> {
    const plan = await this.plans.findActiveForProjectOrLinked(supportProjectId);
    return plan ? this.plans.listLinkedProjectIds(plan.id) : [];
  }
}
