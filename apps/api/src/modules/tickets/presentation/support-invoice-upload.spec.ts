import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { MAX_SUPPORT_INVOICE_PDF_BYTES } from '@kora/contracts';
import { ValidationError } from '@kora/core';
import { readSupportInvoiceAttachmentUpload, readSupportInvoiceUpload } from './support-invoice-upload';

let server: FastifyInstance;
afterEach(async () => { await server.close(); });

async function upload(options: { content?: Buffer; type?: string; field?: string; metadata?: string; filename?: string; single?: boolean; empty?: boolean } = {}) {
  server = Fastify();
  await server.register(multipart);
  server.post('/', async (request) => {
    try {
      if (options.single) return await readSupportInvoiceAttachmentUpload(request);
      const { data, attachments } = await readSupportInvoiceUpload(request);
      return { data, attachments: [...attachments] };
    } catch (error) {
      if (error instanceof ValidationError) return { error: error.code };
      throw error;
    }
  });
  const metadata = options.metadata ?? JSON.stringify({ invoices: [{ folio: '123', invoicedAt: '2026-11-10', amountUf: 10 }] });
  const boundary = 'invoice-test-boundary';
  return server.inject({
    method: 'POST', url: '/',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      ...(options.single ? [] : [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`)]),
      ...(options.empty ? [] : [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${options.field ?? (options.single ? 'file' : 'file_0')}"; filename="${options.filename ?? 'factura.pdf'}"\r\nContent-Type: ${options.type ?? 'application/pdf'}\r\n\r\n`),
        options.content ?? Buffer.from('%PDF-1.4\n%%EOF'),
        Buffer.from('\r\n'),
      ]),
      Buffer.from(`--${boundary}--\r\n`),
    ]),
  });
}

describe('Carga de PDF de soporte', () => {
  it('permite cargar un PDF a una factura existente sin metadata ni registro nuevo', async () => {
    const response = await upload({ single: true });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ name: 'factura.pdf', content: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') });
  });

  it('exige un documento al completar una factura', async () => {
    expect((await upload({ single: true, empty: true })).json()).toEqual({ error: 'INVOICE_ATTACHMENT_MISSING' });
  });

  it('valida la firma del PDF tambien al completar una factura', async () => {
    expect((await upload({ single: true, content: Buffer.from('not pdf') })).json()).toEqual({ error: 'INVALID_INVOICE_PDF' });
  });

  it('rechaza campos inesperados al completar una factura', async () => {
    expect((await upload({ single: true, field: 'otro' })).json()).toEqual({ error: 'INVALID_INVOICE_ATTACHMENT' });
  });

  it('limita el archivo a 5 MB tambien al completar una factura', async () => {
    const content = Buffer.alloc(MAX_SUPPORT_INVOICE_PDF_BYTES + 1, 32);
    content.write('%PDF-');
    expect((await upload({ single: true, content })).json()).toEqual({ error: 'INVALID_INVOICE_UPLOAD' });
  });

  it('conserva los bytes del PDF y su posicion', async () => {
    const response = await upload();
    expect(response.statusCode).toBe(200);
    expect(response.json().attachments).toEqual([[0, {
      name: 'factura.pdf', content: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    }]]);
  });

  it('rechaza archivos que solo simulan ser PDF por extension o MIME', async () => {
    expect((await upload({ content: Buffer.from('<html>no PDF</html>') })).json()).toEqual({ error: 'INVALID_INVOICE_PDF' });
  });

  it('rechaza un adjunto que no corresponde a una factura', async () => {
    expect((await upload({ field: 'file_1' })).json()).toEqual({ error: 'INVALID_INVOICE_ATTACHMENT' });
  });

  it('rechaza metadata malformada', async () => {
    expect((await upload({ metadata: '{' })).json()).toEqual({ error: 'INVALID_INVOICE_METADATA' });
  });

  it('acepta exactamente 5 MB', async () => {
    const content = Buffer.alloc(MAX_SUPPORT_INVOICE_PDF_BYTES, 32);
    content.write('%PDF-');
    expect((await upload({ content })).statusCode).toBe(200);
  });

  it('rechaza 5 MB mas un byte explicitamente', async () => {
    const content = Buffer.alloc(MAX_SUPPORT_INVOICE_PDF_BYTES + 1, 32);
    content.write('%PDF-');
    expect((await upload({ content })).json()).toEqual({ error: 'INVALID_INVOICE_UPLOAD' });
  });
});
