import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { CreateProjectModuleSegmentInput } from '@kora/contracts';
import { ProjectModuleNotFoundError, ProjectNotFoundError } from '../../domain/errors/project.errors';
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

export interface CreateProjectModuleSegmentCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly data: CreateProjectModuleSegmentInput;
  readonly actor: ActorContext;
}

/** Tramo de trabajo de un equipo dentro de una fase/módulo (Roadmap). */
@Injectable()
export class CreateProjectModuleSegmentUseCase
  implements UseCase<CreateProjectModuleSegmentCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateProjectModuleSegmentCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== command.projectId) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const now = this.clock.now();
    const id = await this.modules.addSegment(
      {
        moduleId: command.moduleId,
        teamId: command.data.teamId,
        name: command.data.name,
        startDate: new Date(command.data.startDate),
        endDate: new Date(command.data.endDate),
      },
      now,
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'module_segment_created', moduleId: command.moduleId, segmentId: id },
    });

    return ok({ id });
  }
}
