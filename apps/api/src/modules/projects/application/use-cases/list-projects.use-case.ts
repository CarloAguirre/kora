import { Inject, Injectable } from '@nestjs/common';
import { mapPage, ok, type Page, type Result } from '@kora/core';
import type { ListProjectsQuery, Permission, ProjectSummary } from '@kora/contracts';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { TEAM_REPOSITORY, type TeamRepository } from '../../../teams/domain/repositories/team.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { toProjectSummary } from '../mappers/project.mapper';

export interface ListProjectsQueryCommand {
  readonly query: ListProjectsQuery;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Sin `projects:read` (alcance completo), el actor solo puede listar los
 * proyectos donde participa — `projects:read_assigned` da acceso al mismo
 * endpoint, pero el caso de uso fuerza el filtro a su propio `userId` sin
 * importar lo que haya pedido la consulta.
 *
 * Dos excepciones, ambas para el líder de equipo:
 *  - Si pide `teamId` y es el líder OFICIAL de ese equipo (`teams.leaderUserId`,
 *    ver {@link TeamRepository.isLeaderOfTeam}), ve todos los proyectos de ese
 *    equipo (no solo los suyos) — vista "Proyectos del equipo". Liderar solo
 *    un proyecto puntual asignado al equipo no basta: si no es el líder
 *    oficial, `teamId` se descarta y cae al filtro por `assignedToUserId` de
 *    más abajo, que lo acota a sus propios proyectos.
 *  - Si pide `assignedToUserId` de alguien que pertenece a un equipo que
 *    lidera (oficial o vía liderazgo de proyecto — criterio más amplio, ver
 *    {@link TeamRepository.isTeamLeaderOfMember}), ve los proyectos de esa
 *    persona — ficha de colaborador. Sin esta excepción, un líder sin
 *    `projects:read` completo terminaría viendo siempre sus propios
 *    proyectos al mirar la ficha de otro colaborador.
 */
@Injectable()
export class ListProjectsUseCase implements UseCase<ListProjectsQueryCommand, Page<ProjectSummary>> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
  ) {}

  async execute(command: ListProjectsQueryCommand): Promise<Result<Page<ProjectSummary>>> {
    const { query, actor, actorPermissions } = command;
    const hasFullRead = actorPermissions.includes('projects:read');

    let teamId = query.teamId;
    if (teamId && !hasFullRead) {
      const isLeader = await this.teams.isLeaderOfTeam(actor.userId, teamId);
      if (!isLeader) teamId = undefined;
    }

    let assignedToUserId: string | undefined;
    if (hasFullRead) {
      assignedToUserId = query.assignedToUserId;
    } else if (teamId) {
      assignedToUserId = undefined;
    } else if (query.assignedToUserId && query.assignedToUserId !== actor.userId) {
      const leadsMember = await this.teams.isTeamLeaderOfMember(actor.userId, query.assignedToUserId);
      assignedToUserId = leadsMember ? query.assignedToUserId : actor.userId;
    } else {
      assignedToUserId = actor.userId;
    }

    const page = await this.projects.search(
      {
        search: query.search,
        type: query.type,
        status: query.status,
        phase: query.phase,
        clientId: query.clientId,
        leaderUserId: query.leaderUserId,
        teamId,
        assignedToUserId,
      },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    return ok(mapPage(page, toProjectSummary));
  }
}
