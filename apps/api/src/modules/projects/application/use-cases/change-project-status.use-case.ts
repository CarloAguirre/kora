import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { ChangeProjectStatusInput } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ChangeProjectStatusCommand {
  readonly projectId: string;
  readonly data: ChangeProjectStatusInput;
  readonly actor: ActorContext;
}

@Injectable()
export class ChangeProjectStatusUseCase
  implements UseCase<ChangeProjectStatusCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeProjectStatusCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const previousStatus = project.status;
    if (previousStatus === command.data.status) return ok(undefined);

    project.changeStatus(command.data.status, this.clock.now());
    await this.projects.save(project);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'project',
      entityId: project.id,
      changes: { status: { before: previousStatus, after: command.data.status } },
    });

    return ok(undefined);
  }
}
