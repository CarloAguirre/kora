import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { CreateProjectModuleInput } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
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

export interface CreateProjectModuleCommand {
  readonly projectId: string;
  readonly data: CreateProjectModuleInput;
  readonly actor: ActorContext;
}

@Injectable()
export class CreateProjectModuleUseCase
  implements UseCase<CreateProjectModuleCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateProjectModuleCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const now = this.clock.now();
    const id = await this.modules.create(
      {
        projectId: command.projectId,
        name: command.data.name,
        initialStage: command.data.initialStage,
        estimatedHours: command.data.estimatedHours ?? null,
        estimatedStartDate: command.data.estimatedStartDate ? new Date(command.data.estimatedStartDate) : null,
        estimatedEndDate: command.data.estimatedEndDate ? new Date(command.data.estimatedEndDate) : null,
      },
      now,
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'module_created', moduleId: id, name: command.data.name },
    });

    return ok({ id });
  }
}
