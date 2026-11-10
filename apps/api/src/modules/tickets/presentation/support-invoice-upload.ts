import type { FastifyRequest } from 'fastify';
import { ValidationError } from '@kora/core';
import { markSupportInvoiceIssuedSchema, MAX_SUPPORT_INVOICE_PDF_BYTES, MAX_SUPPORT_INVOICES_PER_PERIOD } from '@kora/contracts';

export async function readSupportInvoiceUpload(request: FastifyRequest) {
  try {
    return await parseUpload(request);
  } catch (error) {
    if (error instanceof Error && 'code' in error && [
      'FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT', 'FST_INVALID_MULTIPART_CONTENT_TYPE',
    ].includes(String(error.code))) {
      throw new ValidationError('Adjunta hasta 10 archivos PDF de como máximo 5 MB cada uno.', 'INVALID_INVOICE_UPLOAD');
    }
    throw error;
  }
}

async function parseUpload(request: FastifyRequest) {
  const attachments = new Map<number, { name: string; content: string }>();
  let metadata: unknown;
  for await (const part of request.parts({
    limits: { fileSize: MAX_SUPPORT_INVOICE_PDF_BYTES, files: MAX_SUPPORT_INVOICES_PER_PERIOD, fields: 1, parts: MAX_SUPPORT_INVOICES_PER_PERIOD + 1 },
  })) {
    if (part.type === 'field') {
      if (part.fieldname !== 'metadata' || typeof part.value !== 'string' || part.valueTruncated) {
        throw new ValidationError('Los datos de la factura no son válidos.', 'INVALID_INVOICE_METADATA');
      }
      try {
        metadata = JSON.parse(part.value);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new ValidationError('Los datos de la factura no son válidos.', 'INVALID_INVOICE_METADATA');
      }
      continue;
    }
    const match = /^file_(0|[1-9]\d*)$/.exec(part.fieldname);
    if (!match || attachments.has(Number(match[1]))) {
      throw new ValidationError('El adjunto no corresponde a una factura.', 'INVALID_INVOICE_ATTACHMENT');
    }
    const content = await part.toBuffer();
    if (part.file.truncated || content.length > MAX_SUPPORT_INVOICE_PDF_BYTES) {
      throw new ValidationError('Cada PDF debe pesar como máximo 5 MB.', 'INVOICE_ATTACHMENT_TOO_LARGE');
    }
    if (part.mimetype !== 'application/pdf' || content.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new ValidationError('El archivo adjunto debe ser un PDF.', 'INVALID_INVOICE_PDF');
    }
    if (!part.filename || part.filename.length > 255) {
      throw new ValidationError('El nombre del PDF debe tener entre 1 y 255 caracteres.', 'INVALID_INVOICE_FILENAME');
    }
    attachments.set(Number(match[1]), { name: part.filename, content: content.toString('base64') });
  }
  const data = markSupportInvoiceIssuedSchema.parse(metadata);
  if ([...attachments.keys()].some((index) => index >= data.invoices.length)) {
    throw new ValidationError('El adjunto no corresponde a una factura.', 'INVALID_INVOICE_ATTACHMENT');
  }
  return { data, attachments };
}
