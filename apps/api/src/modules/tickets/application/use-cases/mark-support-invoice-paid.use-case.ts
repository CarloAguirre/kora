import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { MarkSupportInvoicePaidInput } from '@kora/contracts';
import { SupportInvoiceAlreadyPaidError, SupportInvoiceNotFoundError } from '../../domain/errors/support-plan.errors';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface MarkSupportInvoicePaidCommand {
  readonly invoiceId: string;
  readonly data: MarkSupportInvoicePaidInput;
  readonly actor: ActorContext;
}

@Injectable()
export class MarkSupportInvoicePaidUseCase implements UseCase<MarkSupportInvoicePaidCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: MarkSupportInvoicePaidCommand): Promise<Result<void, ApplicationError>> {
    const { invoiceId, data, actor } = command;

    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) return err(new SupportInvoiceNotFoundError(invoiceId));
    if (invoice.paidAt) return err(new SupportInvoiceAlreadyPaidError());

    await this.invoices.markPaid(invoiceId, new Date(data.paidAt));

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'support_invoice',
      entityId: invoiceId,
      metadata: { paidAt: data.paidAt },
    });

    return ok(undefined);
  }
}
