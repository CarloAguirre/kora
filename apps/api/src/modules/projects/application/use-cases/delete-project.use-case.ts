import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { ProjectAlreadyDeletedError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteProjectCommand {
  readonly projectId: string;
  readonly actor: ActorContext;
}

/** Baja lógica. Las horas registradas y tickets del proyecto se conservan íntegros. */
@Injectable()
export class DeleteProjectUseCase implements UseCase<DeleteProjectCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteProjectCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project) return err(new ProjectNotFoundError(command.projectId));
    if (project.isDeleted) return err(new ProjectAlreadyDeletedError());

    project.softDelete(this.clock.now());
    await this.projects.save(project);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'delete',
      entityType: 'project',
      entityId: project.id,
      metadata: { name: project.name },
    });

    return ok(undefined);
  }
}
