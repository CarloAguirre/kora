import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { ValidationError } from '@kora/core';
import { MAX_SUPPORT_INVOICE_PDF_BYTES, MAX_SUPPORT_INVOICES_PER_PERIOD, MAX_PAYMENT_RECEIPT_BYTES, type PaymentReceiptMimeType } from '@kora/contracts';

type Document = { name: string; content: string };
type PaymentReceipt = Document & { mimeType: PaymentReceiptMimeType };
type ReadFile<T extends Document> = (part: MultipartFile) => Promise<T>;

async function handleUploadErrors<T>(parse: () => Promise<T>): Promise<T> {
  try {
    return await parse();
  } catch (error) {
    if (error instanceof Error && 'code' in error && [
      'FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT', 'FST_INVALID_MULTIPART_CONTENT_TYPE',
    ].includes(String(error.code))) {
      throw new ValidationError('Verifica la cantidad de adjuntos y que cada archivo pese como máximo 5 MB.', 'INVALID_INVOICE_UPLOAD');
    }
    throw error;
  }
}

export function readInvoiceUpload(request: FastifyRequest, maxFiles = MAX_SUPPORT_INVOICES_PER_PERIOD) {
  return handleUploadErrors(() => parseUpload(request, maxFiles, readPdf));
}

export function readInvoiceAttachmentUpload(request: FastifyRequest) {
  return readSingleAttachment(request, readPdf);
}

export function readPaymentReceiptUpload(request: FastifyRequest) {
  return handleUploadErrors(() => parseUpload(request, 1, readPaymentReceipt));
}

export function readPaymentReceiptAttachmentUpload(request: FastifyRequest) {
  return readSingleAttachment(request, readPaymentReceipt);
}

function readSingleAttachment<T extends Document>(request: FastifyRequest, readFile: ReadFile<T>) {
  return handleUploadErrors(async () => {
    let attachment: T | undefined;
    for await (const part of request.parts({
      limits: { fileSize: MAX_SUPPORT_INVOICE_PDF_BYTES, files: 1, fields: 0, parts: 1 },
    })) {
      if (part.type !== 'file' || part.fieldname !== 'file') {
        throw new ValidationError('Adjunta el documento en el campo file.', 'INVALID_INVOICE_ATTACHMENT');
      }
      attachment = await readFile(part);
    }
    if (!attachment) throw new ValidationError('Debes adjuntar el documento.', 'INVOICE_ATTACHMENT_MISSING');
    return attachment;
  });
}

async function readPaymentReceipt(part: MultipartFile): Promise<PaymentReceipt> {
  const content = await part.toBuffer();
  if (part.file.truncated || content.length > MAX_PAYMENT_RECEIPT_BYTES) {
    throw new ValidationError('El comprobante debe pesar como máximo 5 MB.', 'PAYMENT_RECEIPT_TOO_LARGE');
  }
  const isPdf = content.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPng = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255;
  const mimeType = part.mimetype;
  if (!((mimeType === 'application/pdf' && isPdf) || (mimeType === 'image/png' && isPng) || (mimeType === 'image/jpeg' && isJpeg))) {
    throw new ValidationError('El comprobante debe ser un PDF o una imagen JPG/PNG.', 'INVALID_PAYMENT_RECEIPT');
  }
  if (!part.filename || part.filename.length > 255) {
    throw new ValidationError('El nombre del comprobante debe tener entre 1 y 255 caracteres.', 'INVALID_PAYMENT_RECEIPT_FILENAME');
  }
  return { name: part.filename, content: content.toString('base64'), mimeType };
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

async function parseUpload<T extends Document>(request: FastifyRequest, maxFiles: number, readFile: ReadFile<T>) {
  const attachments = new Map<number, T>();
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
    attachments.set(Number(match[1]), await readFile(part));
  }
  return { metadata, attachments };
}
