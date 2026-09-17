import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import {
  ProjectPaymentMilestoneNotEditableError,
  ProjectPaymentMilestoneNotFoundError,
} from '../../domain/errors/project.errors';
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
}

@Injectable()
export class DeleteProjectPaymentMilestoneUseCase
  implements UseCase<DeleteProjectPaymentMilestoneCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: DeleteProjectPaymentMilestoneCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== command.projectId) {
      return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    }
    if (milestone.status !== 'pending') return err(new ProjectPaymentMilestoneNotEditableError());

    await this.milestones.remove(command.milestoneId);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'payment_milestone_deleted', milestoneId: command.milestoneId },
    });

    return ok(undefined);
  }
}
