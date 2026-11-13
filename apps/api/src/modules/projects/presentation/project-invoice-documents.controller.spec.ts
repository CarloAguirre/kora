import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import { ok, ValidationError } from '@kora/core';
import { MAX_SUPPORT_INVOICE_PDF_BYTES } from '@kora/contracts';
import type { RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { AttachProjectInvoiceDocumentUseCase, GetProjectInvoiceDocumentUseCase } from '../application/use-cases/project-invoice-document.use-cases';
import type { IssueProjectPaymentMilestoneInvoiceUseCase } from '../application/use-cases/issue-project-payment-milestone-invoice.use-case';
import { ProjectInvoiceDocumentsController } from './project-invoice-documents.controller';

let server: FastifyInstance | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

function setup() {
  const attach = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
  const read = { execute: vi.fn().mockResolvedValue(ok({ name: 'factura original.pdf', content: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') })) };
  const issue = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
  const controller = new ProjectInvoiceDocumentsController(
    attach as unknown as AttachProjectInvoiceDocumentUseCase,
    read as unknown as GetProjectInvoiceDocumentUseCase,
    issue as unknown as IssueProjectPaymentMilestoneInvoiceUseCase,
  );
  return { controller, attach, read, issue };
}

async function upload(options: { existing?: boolean; content?: Buffer; type?: string } = {}) {
  const test = setup();
  server = Fastify();
  await server.register(multipart);
  server.post('/', async (request, reply) => {
    try {
      const actor = { id: 'finance-1', email: 'finance@example.test' } as RequestUser;
      if (options.existing) await test.controller.upload('project-1', 'milestone-1', request, actor);
      else await test.controller.issue('project-1', 'milestone-1', request, actor);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof ValidationError) return reply.code(400).send({ code: error.code });
      throw error;
    }
  });
  const boundary = 'project-invoice-test';
  const metadata = { folio: 'F-4444', issuedAt: '2026-11-10', pauseForManagementApproval: true };
  const response = await server.inject({
    method: 'POST', url: '/', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      ...(options.existing ? [] : [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`)]),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${options.existing ? 'file' : 'file_0'}"; filename="factura.pdf"\r\nContent-Type: ${options.type ?? 'application/pdf'}\r\n\r\n`),
      options.content ?? Buffer.from('%PDF-1.4\n%%EOF'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  return { ...test, response, metadata };
}

describe('Endpoints de documentos de facturas de proyecto', () => {
  it('registra la factura con sus datos, PDF y decision de Hito 0', async () => {
    const { issue, attach, response, metadata } = await upload();
    expect(response.statusCode).toBe(204);
    expect(issue.execute).toHaveBeenCalledWith({
      projectId: 'project-1', milestoneId: 'milestone-1', data: metadata,
      attachment: { name: 'factura.pdf', content: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') },
      actor: { userId: 'finance-1', email: 'finance@example.test' },
    });
    expect(attach.execute).not.toHaveBeenCalled();
  });

  it('completa una factura existente sin ejecutar el registro ni Hito 0', async () => {
    const { issue, attach, response } = await upload({ existing: true });
    expect(response.statusCode).toBe(204);
    expect(attach.execute).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', milestoneId: 'milestone-1' }));
    expect(issue.execute).not.toHaveBeenCalled();
  });

  it('rechaza un archivo que no tenga firma PDF', async () => {
    const { issue, response } = await upload({ content: Buffer.from('<html>no PDF</html>') });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'INVALID_INVOICE_PDF' });
    expect(issue.execute).not.toHaveBeenCalled();
  });

  it('acepta exactamente 5 MB', async () => {
    const content = Buffer.alloc(MAX_SUPPORT_INVOICE_PDF_BYTES, 32);
    content.write('%PDF-');
    expect((await upload({ content })).response.statusCode).toBe(204);
  });

  it('rechaza mas de 5 MB al completar una factura', async () => {
    const content = Buffer.alloc(MAX_SUPPORT_INVOICE_PDF_BYTES + 1, 32);
    content.write('%PDF-');
    const { response, attach } = await upload({ existing: true, content });
    expect(response.statusCode).toBe(400);
    expect(attach.execute).not.toHaveBeenCalled();
  });

  it('devuelve los bytes originales como PDF inline y sin cache', async () => {
    const { controller, read } = setup();
    const reply = { header: vi.fn() };
    const file = await controller.read('project-1', 'milestone-1', reply as unknown as FastifyReply);
    expect(read.execute).toHaveBeenCalledWith({ projectId: 'project-1', milestoneId: 'milestone-1' });
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from('%PDF-1.4\n%%EOF'));
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: "inline; filename=\"factura.pdf\"; filename*=UTF-8''factura%20original.pdf",
    });
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
