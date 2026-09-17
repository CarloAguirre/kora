import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { UpdateProjectPaymentMilestoneInput } from '@kora/contracts';
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

export interface UpdateProjectPaymentMilestoneCommand {
  readonly projectId: string;
  readonly milestoneId: string;
  readonly data: UpdateProjectPaymentMilestoneInput;
  readonly actor: ActorContext;
}

@Injectable()
export class UpdateProjectPaymentMilestoneUseCase
  implements UseCase<UpdateProjectPaymentMilestoneCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateProjectPaymentMilestoneCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== command.projectId) {
      return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    }
    if (milestone.status !== 'pending') return err(new ProjectPaymentMilestoneNotEditableError());

    await this.milestones.update(command.milestoneId, {
      ...(command.data.name !== undefined ? { name: command.data.name } : {}),
      ...(command.data.percent !== undefined ? { percent: command.data.percent } : {}),
      ...(command.data.amount !== undefined ? { amount: command.data.amount } : {}),
      ...(command.data.sortOrder !== undefined ? { sortOrder: command.data.sortOrder } : {}),
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'payment_milestone_updated', milestoneId: command.milestoneId },
    });

    return ok(undefined);
  }
}
