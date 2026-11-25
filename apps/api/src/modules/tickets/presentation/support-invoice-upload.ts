import type { FastifyRequest } from 'fastify';
import { ValidationError } from '@kora/core';
import { markSupportInvoiceIssuedSchema } from '@kora/contracts';
import { readInvoiceUpload } from '../../../shared/presentation/invoice-upload';
export { readInvoiceAttachmentUpload as readSupportInvoiceAttachmentUpload } from '../../../shared/presentation/invoice-upload';

export async function readSupportInvoiceUpload(request: FastifyRequest) {
  const { metadata, attachments } = await readInvoiceUpload(request);
  const data = markSupportInvoiceIssuedSchema.parse(metadata);
  if ([...attachments.keys()].some((index) => index >= data.invoices.length)) {
    throw new ValidationError('El adjunto no corresponde a una factura.', 'INVALID_INVOICE_ATTACHMENT');
  }
  return { data, attachments };
}
