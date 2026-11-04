import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, isUuid, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission, ProjectPhaseOption } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ListProjectPhasesCommand {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Fases y tiempos de ejecución de un proyecto, para asociarles un registro de
 * horas. A diferencia de `GetProjectUseCase` no expone el resto de la ficha,
 * así que basta `hours:register`; el alcance es el mismo: sin `projects:read`,
 * solo si participa en el proyecto.
 */
@Injectable()
export class ListProjectPhasesUseCase
  implements UseCase<ListProjectPhasesCommand, ProjectPhaseOption[], ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly teams: ProjectTeamRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
  ) {}

  async execute(command: ListProjectPhasesCommand): Promise<Result<ProjectPhaseOption[], ApplicationError>> {
    const project = isUuid(command.projectId) ? await this.projects.findById(command.projectId) : null;
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:read')) {
      const snapshot = project.toSnapshot();
      const [members, projectTeams] = await Promise.all([
        this.members.listForProject(project.id),
        this.teams.findByProject(project.id),
      ]);
      const isParticipant =
        snapshot.leaderUserId === command.actorUserId ||
        snapshot.developerUserId === command.actorUserId ||
        snapshot.commercialManagerUserId === command.actorUserId ||
        projectTeams.some((team) => team.leaderUserId === command.actorUserId) ||
        members.some((member) => member.userId === command.actorUserId);
      if (!isParticipant) return err(new ForbiddenError('No tienes acceso a este proyecto.', 'PROJECT_NOT_ASSIGNED'));
    }

    const modules = await this.modules.listForProject(project.id);
    return ok(
      modules.map((module) => ({
        id: module.id,
        name: module.name,
        currentStage: module.currentStage,
        segments: module.segments.map((segment) => ({
          id: segment.id,
          teamName: segment.teamName,
          name: segment.name,
          startDate: segment.startDate.toISOString().slice(0, 10),
          endDate: segment.endDate.toISOString().slice(0, 10),
        })),
      })),
    );
  }
}
