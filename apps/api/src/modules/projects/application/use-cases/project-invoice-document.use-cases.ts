import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, err, ok, type ApplicationError, type Result } from '@kora/core';
import { PROJECT_PAYMENT_MILESTONE_REPOSITORY, type ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import { ProjectPaymentMilestoneNotFoundError } from '../../domain/errors/project.errors';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

interface Query { projectId: string; milestoneId: string }
type Attachment = { name: string; content: string };
interface Command extends Query { attachment: Attachment; actor: ActorContext }

@Injectable()
export class AttachProjectInvoiceDocumentUseCase implements UseCase<Command, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: Command): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone || milestone.projectId !== command.projectId) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status !== 'invoiced' && milestone.status !== 'paid') {
      return err(new ConflictError('Primero debes registrar la factura del tramo.', 'PROJECT_INVOICE_NOT_ISSUED'));
    }
    if (milestone.hasAttachment || !(await this.milestones.attachDocument(command.milestoneId, command.attachment))) {
      return err(new ConflictError('La factura ya tiene un documento adjunto.', 'INVOICE_ATTACHMENT_EXISTS'));
    }
    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project_payment_milestone',
      entityId: command.milestoneId,
      metadata: { attachmentName: command.attachment.name },
    });
    return ok(undefined);
  }
}

@Injectable()
export class GetProjectInvoiceDocumentUseCase implements UseCase<Query, Attachment, ApplicationError> {
  constructor(@Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository) {}

  async execute(query: Query): Promise<Result<Attachment, ApplicationError>> {
    const milestone = await this.milestones.findById(query.milestoneId);
    if (!milestone || milestone.projectId !== query.projectId) return err(new ProjectPaymentMilestoneNotFoundError(query.milestoneId));
    const attachment = await this.milestones.getAttachment(query.milestoneId);
    return attachment ? ok(attachment) : err(new NotFoundError('PDF de la factura', query.milestoneId));
  }
}
