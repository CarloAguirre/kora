import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, err, ok, type ApplicationError, type Result } from '@kora/core';
import { SupportInvoiceNotFoundError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

interface Command {
  invoiceId: string;
  attachment: { name: string; content: string };
  actor: ActorContext;
}

@Injectable()
export class AttachSupportInvoiceDocumentUseCase implements UseCase<Command, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute({ invoiceId, attachment, actor }: Command): Promise<Result<void, ApplicationError>> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) return err(new SupportInvoiceNotFoundError(invoiceId));
    if (invoice.hasAttachment || !(await this.invoices.attachDocument(invoiceId, attachment))) {
      return err(new ConflictError('La factura ya tiene un documento adjunto.', 'INVOICE_ATTACHMENT_EXISTS'));
    }
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'support_invoice',
      entityId: invoiceId,
      metadata: { attachmentName: attachment.name },
    });
    return ok(undefined);
  }
}
