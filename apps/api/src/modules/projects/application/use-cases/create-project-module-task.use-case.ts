import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { CreateProjectModuleTaskInput, Permission } from '@kora/contracts';
import { ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateProjectModuleTaskCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: CreateProjectModuleTaskInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Tarea puntual de una fase/módulo — marcador en el Roadmap. Sin
 * `projects:manage`, solo puede crearla el líder del equipo indicado en
 * `data.teamId` (ver `ProjectTeamRepository.isTeamLeaderForProject`) — sin
 * equipo no hay contra qué verificar liderazgo, así que exige el permiso
 * amplio.
 */
@Injectable()
export class CreateProjectModuleTaskUseCase
  implements UseCase<CreateProjectModuleTaskCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateProjectModuleTaskCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== command.projectId) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!command.actorPermissions.includes('projects:manage')) {
      const teamId = command.data.teamId;
      const isTeamLeader =
        teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(command.projectId, teamId, command.actor.userId));
      if (!isTeamLeader) {
        return err(new ForbiddenError('No lideras el equipo de esta tarea.', 'PROJECT_TEAM_NOT_LED'));
      }
    }

    const now = this.clock.now();
    const id = await this.modules.addTask(
      {
        moduleId: command.moduleId,
        teamId: command.data.teamId ?? null,
        assigneeUserId: command.data.assigneeUserId ?? null,
        name: command.data.name,
        description: command.data.description ?? null,
        startDate: command.data.startDate ? new Date(command.data.startDate) : null,
        date: new Date(command.data.date),
        estimatedHours: command.data.estimatedHours ?? null,
        status: command.data.status ?? 'todo',
        scope: command.data.scope ?? 'desarrollo',
      },
      now,
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'module_task_created', moduleId: command.moduleId, taskId: id },
    });

    return ok({ id });
  }
}
