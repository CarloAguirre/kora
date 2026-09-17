import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { CreateProjectPaymentMilestoneInput } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateProjectPaymentMilestoneCommand {
  readonly projectId: string;
  readonly data: CreateProjectPaymentMilestoneInput;
  readonly actor: ActorContext;
}

/** Configurar el cronograma de cobro de un proyecto — decisión de PM/PMO, ver `projects:manage` en el controlador. */
@Injectable()
export class CreateProjectPaymentMilestoneUseCase
  implements UseCase<CreateProjectPaymentMilestoneCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: CreateProjectPaymentMilestoneCommand,
  ): Promise<Result<{ id: string }, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const id = await this.milestones.create({
      projectId: command.projectId,
      name: command.data.name,
      percent: command.data.percent ?? null,
      amount: command.data.amount,
      sortOrder: command.data.sortOrder ?? 0,
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: command.projectId,
      metadata: { event: 'payment_milestone_created', milestoneId: id },
    });

    return ok({ id });
  }
}
