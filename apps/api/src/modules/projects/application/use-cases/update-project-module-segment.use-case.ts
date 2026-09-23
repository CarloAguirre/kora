import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectModuleSegmentInput } from '@kora/contracts';
import {
  CannotManageProjectError,
  ProjectModuleNotFoundError,
  ProjectModuleSegmentNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
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

export interface UpdateProjectModuleSegmentCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly segmentId: string;
  readonly data: UpdateProjectModuleSegmentInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class UpdateProjectModuleSegmentUseCase
  implements UseCase<UpdateProjectModuleSegmentCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectModuleSegmentCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!module.segments.some((segment) => segment.id === command.segmentId)) {
      return err(new ProjectModuleSegmentNotFoundError(command.segmentId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    await this.modules.updateSegment(
      command.segmentId,
      {
        ...(command.data.teamId !== undefined ? { teamId: command.data.teamId } : {}),
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.startDate !== undefined ? { startDate: new Date(command.data.startDate) } : {}),
        ...(command.data.endDate !== undefined ? { endDate: new Date(command.data.endDate) } : {}),
      },
      this.clock.now(),
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_segment_updated', moduleId: command.moduleId, segmentId: command.segmentId },
    });

    return ok(undefined);
  }
}
