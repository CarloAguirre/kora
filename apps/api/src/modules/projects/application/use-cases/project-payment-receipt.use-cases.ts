import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, err, ok, type ApplicationError, type Result } from '@kora/core';
import { PROJECT_PAYMENT_MILESTONE_REPOSITORY, type ProjectPaymentMilestoneRepository, type ProjectPaymentReceipt } from '../../domain/repositories/project-payment-milestone.repository';
import { ProjectPaymentMilestoneNotFoundError } from '../../domain/errors/project.errors';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

interface Query { projectId: string; milestoneId: string }
interface Command extends Query { receipt: ProjectPaymentReceipt; actor: ActorContext }

@Injectable()
export class AttachProjectPaymentReceiptUseCase implements UseCase<Command, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: Command): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== command.projectId) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status !== 'paid') return err(new ConflictError('Primero debes registrar el pago del tramo.', 'PROJECT_PAYMENT_NOT_RECORDED'));
    if (milestone.hasPaymentReceipt || !(await this.milestones.attachPaymentReceipt(command.milestoneId, command.receipt))) {
      return err(new ConflictError('El pago ya tiene un comprobante adjunto.', 'PAYMENT_RECEIPT_EXISTS'));
    }
    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project_payment_milestone',
      entityId: command.milestoneId,
      metadata: { paymentReceiptName: command.receipt.name },
    });
    return ok(undefined);
  }
}

@Injectable()
export class GetProjectPaymentReceiptUseCase implements UseCase<Query, ProjectPaymentReceipt, ApplicationError> {
  constructor(@Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository) {}

  async execute(query: Query): Promise<Result<ProjectPaymentReceipt, ApplicationError>> {
    const milestone = await this.milestones.findById(query.milestoneId);
    if (!milestone || milestone.projectId !== query.projectId) return err(new ProjectPaymentMilestoneNotFoundError(query.milestoneId));
    const receipt = await this.milestones.getPaymentReceipt(query.milestoneId);
    return receipt ? ok(receipt) : err(new NotFoundError('Comprobante del pago', query.milestoneId));
  }
}
