import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ProjectType, TicketLinkableProject } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
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
 *
 * Para `type='support'` suma, además de los proyectos "contenedor" de soporte
 * (contratos legados y `CreateSupportProjectUseCase`), los proyectos de
 * desarrollo cubiertos por contratos activos creados desde la v2: esos
 * contratos no tienen proyecto de soporte propio (`support_plans.project_id`
 * nulo), y el ticket se abre directo contra el proyecto cubierto — que es lo
 * que ya resuelven `findActiveForProjectOrLinked` y el cálculo de consumo.
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
    if (query.type !== 'support') return ok(items);

    const covered = await this.listCoveredByActivePlans(query.clientId);
    return ok([...items, ...covered].sort((a, b) => a.name.localeCompare(b.name, 'es')));
  }

  private async listCoveredByActivePlans(clientId: string): Promise<TicketLinkableProject[]> {
    const activePlans = (await this.plans.listForClient(clientId)).filter((plan) => plan.status === 'active');
    const coverage = await Promise.all(
      activePlans.map(async (plan) => ({ plan, projectIds: await this.plans.listLinkedProjectIds(plan.id) })),
    );

    const projects = await this.projects.findManyByIds(coverage.flatMap((entry) => entry.projectIds));
    const byId = new Map(projects.map((project) => [project.id, project]));

    return coverage.flatMap(({ plan, projectIds }) =>
      projectIds.flatMap((projectId) => {
        const project = byId.get(projectId);
        if (!project) return [];
        // En un consolidado varios proyectos comparten el nombre del contrato — sin el del proyecto, las opciones serían indistinguibles.
        const planName = plan.name ?? project.name;
        return [{ id: project.id, name: plan.scope === 'consolidated' ? `${planName} · ${project.name}` : planName }];
      }),
    );
  }
}
