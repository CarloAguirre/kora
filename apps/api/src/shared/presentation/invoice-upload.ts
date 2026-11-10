import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { ValidationError } from '@kora/core';
import { MAX_SUPPORT_INVOICE_PDF_BYTES, MAX_SUPPORT_INVOICES_PER_PERIOD } from '@kora/contracts';

async function handleUploadErrors<T>(parse: () => Promise<T>): Promise<T> {
  try {
    return await parse();
  } catch (error) {
    if (error instanceof Error && 'code' in error && [
      'FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT', 'FST_INVALID_MULTIPART_CONTENT_TYPE',
    ].includes(String(error.code))) {
      throw new ValidationError('Verifica la cantidad de adjuntos y que cada archivo sea un PDF de como máximo 5 MB.', 'INVALID_INVOICE_UPLOAD');
    }
    throw error;
  }
}

export function readInvoiceUpload(request: FastifyRequest, maxFiles = MAX_SUPPORT_INVOICES_PER_PERIOD) {
  return handleUploadErrors(() => parseUpload(request, maxFiles));
}

export function readInvoiceAttachmentUpload(request: FastifyRequest) {
  return handleUploadErrors(async () => {
    let attachment: { name: string; content: string } | undefined;
    for await (const part of request.parts({
      limits: { fileSize: MAX_SUPPORT_INVOICE_PDF_BYTES, files: 1, fields: 0, parts: 1 },
    })) {
      if (part.type !== 'file' || part.fieldname !== 'file') {
        throw new ValidationError('Adjunta un PDF en el campo file.', 'INVALID_INVOICE_ATTACHMENT');
      }
      attachment = await readPdf(part);
    }
    if (!attachment) throw new ValidationError('Debes adjuntar el PDF de la factura.', 'INVOICE_ATTACHMENT_MISSING');
    return attachment;
  });
}

async function readPdf(part: MultipartFile): Promise<{ name: string; content: string }> {
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
  return { name: part.filename, content: content.toString('base64') };
}

async function parseUpload(request: FastifyRequest, maxFiles: number) {
  const attachments = new Map<number, { name: string; content: string }>();
  let metadata: unknown;
  for await (const part of request.parts({
    limits: { fileSize: MAX_SUPPORT_INVOICE_PDF_BYTES, files: maxFiles, fields: 1, parts: maxFiles + 1 },
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
    attachments.set(Number(match[1]), await readPdf(part));
  }
  return { metadata, attachments };
}
