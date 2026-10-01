import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectModuleInput } from '@kora/contracts';
import { CannotManageProjectError, ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';

export interface UpdateProjectModuleCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: UpdateProjectModuleInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class UpdateProjectModuleUseCase implements UseCase<UpdateProjectModuleCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly progress: ProjectProgressRecalculator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectModuleCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    await this.modules.update(
      command.moduleId,
      {
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.currentStage !== undefined ? { currentStage: command.data.currentStage } : {}),
        ...(command.data.estimatedHours !== undefined ? { estimatedHours: command.data.estimatedHours } : {}),
        ...(command.data.estimatedStartDate !== undefined
          ? { estimatedStartDate: command.data.estimatedStartDate ? new Date(command.data.estimatedStartDate) : null }
          : {}),
        ...(command.data.estimatedEndDate !== undefined
          ? { estimatedEndDate: command.data.estimatedEndDate ? new Date(command.data.estimatedEndDate) : null }
          : {}),
      },
      this.clock.now(),
    );
    await this.progress.recalculate(project.id);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_updated', moduleId: command.moduleId },
    });

    return ok(undefined);
  }
}
