import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, err, ok, type ApplicationError, type Result } from '@kora/core';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import type { UseCase } from '../../../../shared/application/use-case';

type Attachment = { name: string; content: string };
type Query = { invoiceId: string };

@Injectable()
export class GetSupportInvoiceAttachmentUseCase implements UseCase<Query, Attachment, ApplicationError> {
  constructor(@Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository) {}

  async execute({ invoiceId }: Query): Promise<Result<Attachment, ApplicationError>> {
    const attachment = await this.invoices.getAttachment(invoiceId);
    if (!attachment) return err(new NotFoundError('PDF de la factura', invoiceId));
    return ok(attachment);
  }
}
