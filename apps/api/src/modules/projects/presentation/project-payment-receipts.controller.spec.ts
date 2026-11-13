import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';
import { ok, ValidationError } from '@kora/core';
import { MAX_PAYMENT_RECEIPT_BYTES } from '@kora/contracts';
import type { RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { AttachProjectPaymentReceiptUseCase, GetProjectPaymentReceiptUseCase } from '../application/use-cases/project-payment-receipt.use-cases';
import type { MarkProjectPaymentMilestonePaidUseCase } from '../application/use-cases/mark-project-payment-milestone-paid.use-case';
import { ProjectPaymentReceiptsController } from './project-payment-receipts.controller';

let server: FastifyInstance | undefined;
afterEach(async () => { await server?.close(); server = undefined; });
const formats = [
  { type: 'application/pdf', name: 'comprobante.pdf', content: Buffer.from('%PDF-1.4\n%%EOF') },
  { type: 'image/png', name: 'boleta.png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]) },
  { type: 'image/jpeg', name: 'boleta.jpg', content: Buffer.from([255, 216, 255, 224, 1, 2, 255, 217]) },
];

function setup(format = formats[0]!) {
  const receipt = { name: format.name, content: format.content.toString('base64'), mimeType: format.type };
  const attach = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
  const read = { execute: vi.fn().mockResolvedValue(ok(receipt)) };
  const pay = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
  const controller = new ProjectPaymentReceiptsController(
    attach as unknown as AttachProjectPaymentReceiptUseCase,
    read as unknown as GetProjectPaymentReceiptUseCase,
    pay as unknown as MarkProjectPaymentMilestonePaidUseCase,
  );
  return { controller, attach, read, pay, receipt };
}

async function upload(options: { existing?: boolean; format?: typeof formats[number]; field?: string; missing?: boolean } = {}) {
  const format = options.format ?? formats[0]!;
  const test = setup(format);
  server = Fastify();
  await server.register(multipart);
  server.post('/', async (request, reply) => {
    try {
      const actor = { id: 'finance-1', email: 'finance@example.test' } as RequestUser;
      if (options.existing) await test.controller.upload('project-1', 'milestone-1', request, actor);
      else await test.controller.pay('project-1', 'milestone-1', request, actor);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof ValidationError) return reply.code(400).send({ code: error.code });
      throw error;
    }
  });
  const boundary = 'payment-receipt-test';
  const response = await server.inject({
    method: 'POST', url: '/', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      ...(options.existing ? [] : [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{"paidAt":"2026-11-10"}\r\n`)]),
      ...(options.missing ? [] : [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${options.field ?? (options.existing ? 'file' : 'file_0')}"; filename="${format.name}"\r\nContent-Type: ${format.type}\r\n\r\n`),
        format.content,
        Buffer.from('\r\n'),
      ]),
      Buffer.from(`--${boundary}--\r\n`),
    ]),
  });
  return { ...test, response };
}

describe('Carga y lectura de comprobantes de pago', () => {
  it.each(formats)('registra el pago con comprobante $type', async (format) => {
    const { response, pay, receipt } = await upload({ format });
    expect(response.statusCode).toBe(204);
    expect(pay.execute).toHaveBeenCalledWith({
      projectId: 'project-1', milestoneId: 'milestone-1', data: { paidAt: '2026-11-10' }, receipt,
      actor: { userId: 'finance-1', email: 'finance@example.test' },
    });
  });

  it.each(formats)('adjunta un $type a un pago ya registrado sin volver a pagarlo', async (format) => {
    const { response, pay, attach, receipt } = await upload({ existing: true, format });
    expect(response.statusCode).toBe(204);
    expect(attach.execute).toHaveBeenCalledWith(expect.objectContaining({ receipt }));
    expect(pay.execute).not.toHaveBeenCalled();
  });

  it.each(formats)('sirve $type inline conservando sus bytes', async (format) => {
    const { controller } = setup(format);
    const reply = { header: vi.fn() };
    const document = await controller.read('project-1', 'milestone-1', reply as unknown as FastifyReply);
    const chunks: Buffer[] = [];
    for await (const chunk of document.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(format.content);
    expect(document.getHeaders()).toMatchObject({ type: format.type, disposition: expect.stringContaining('inline;') });
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it.each([
    { type: 'image/png', name: 'falso.png', content: Buffer.from('<html>no PNG</html>') },
    { ...formats[1]!, type: 'image/jpeg' },
    { type: 'image/svg+xml', name: 'archivo.svg', content: Buffer.from('<svg></svg>') },
  ])('rechaza tipos no admitidos o firmas inconsistentes: $name', async (format) => {
    const { response, pay } = await upload({ format });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'INVALID_PAYMENT_RECEIPT' });
    expect(pay.execute).not.toHaveBeenCalled();
  });

  it('acepta exactamente 5 MB', async () => {
    const content = Buffer.alloc(MAX_PAYMENT_RECEIPT_BYTES, 32);
    content.write('%PDF-');
    expect((await upload({ format: { ...formats[0]!, content } })).response.statusCode).toBe(204);
  });

  it('rechaza 5 MB mas un byte', async () => {
    const content = Buffer.alloc(MAX_PAYMENT_RECEIPT_BYTES + 1, 32);
    content.write('%PDF-');
    const { response, attach } = await upload({ existing: true, format: { ...formats[0]!, content } });
    expect(response.statusCode).toBe(400);
    expect(attach.execute).not.toHaveBeenCalled();
  });

  it('no registra un pago si se eligio carga con comprobante y no llega el archivo', async () => {
    const { response, pay } = await upload({ missing: true });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'PAYMENT_RECEIPT_MISSING' });
    expect(pay.execute).not.toHaveBeenCalled();
  });
});
