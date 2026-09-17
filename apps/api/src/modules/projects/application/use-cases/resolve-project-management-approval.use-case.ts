import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { ProjectManagementApprovalNotPendingError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ResolveProjectManagementApprovalCommand {
  readonly projectId: string;
  readonly actor: ActorContext;
}

/** Botón "Activar proyecto" para un Hito 0 que quedó pausado esperando a Gerencia. */
@Injectable()
export class ResolveProjectManagementApprovalUseCase
  implements UseCase<ResolveProjectManagementApprovalCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResolveProjectManagementApprovalCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));
    if (!project.pendingManagementApproval) return err(new ProjectManagementApprovalNotPendingError());

    project.resolveManagementApproval(this.clock.now());
    await this.projects.save(project);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'status_change',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'management_approval_resolved' },
    });

    return ok(undefined);
  }
}
