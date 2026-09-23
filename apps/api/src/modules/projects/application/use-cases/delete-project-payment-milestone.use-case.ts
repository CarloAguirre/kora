import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { Permission } from '@kora/contracts';
import {
  CannotManageProjectError,
  ProjectNotFoundError,
  ProjectPaymentMilestoneNotEditableError,
  ProjectPaymentMilestoneNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteProjectPaymentMilestoneCommand {
  readonly projectId: string;
  readonly milestoneId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class DeleteProjectPaymentMilestoneUseCase
  implements UseCase<DeleteProjectPaymentMilestoneCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: DeleteProjectPaymentMilestoneCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== project.id) {
      return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    }
    if (milestone.status !== 'pending') return err(new ProjectPaymentMilestoneNotEditableError());

    await this.milestones.remove(command.milestoneId);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'payment_milestone_deleted', milestoneId: command.milestoneId },
    });

    return ok(undefined);
  }
}
