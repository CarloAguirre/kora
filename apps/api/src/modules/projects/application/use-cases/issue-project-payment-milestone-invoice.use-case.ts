import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { IssueProjectPaymentMilestoneInvoiceInput } from '@kora/contracts';
import { ProjectPaymentMilestoneAlreadyIssuedError, ProjectPaymentMilestoneNotFoundError } from '../../domain/errors/project.errors';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface IssueProjectPaymentMilestoneInvoiceCommand {
  readonly milestoneId: string;
  readonly data: IssueProjectPaymentMilestoneInvoiceInput;
  readonly actor: ActorContext;
}

/**
 * Registra que un tramo ya fue facturado — igual criterio que
 * `MarkSupportInvoiceIssuedUseCase`: Kora no emite la factura, solo folio y
 * fecha. El adjunto es solo el nombre del archivo (sin Storage todavía).
 */
@Injectable()
export class IssueProjectPaymentMilestoneInvoiceUseCase
  implements UseCase<IssueProjectPaymentMilestoneInvoiceCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly milestones: ProjectPaymentMilestoneRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: IssueProjectPaymentMilestoneInvoiceCommand): Promise<Result<void, ApplicationError>> {
    const milestone = await this.milestones.findById(command.milestoneId);
    if (!milestone) return err(new ProjectPaymentMilestoneNotFoundError(command.milestoneId));
    if (milestone.status !== 'pending') return err(new ProjectPaymentMilestoneAlreadyIssuedError());

    await this.milestones.markIssued(command.milestoneId, {
      invoiceNumber: command.data.folio,
      issuedAt: new Date(command.data.issuedAt),
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: milestone.projectId,
      metadata: { event: 'payment_milestone_issued', milestoneId: command.milestoneId, folio: command.data.folio },
    });

    return ok(undefined);
  }
}
