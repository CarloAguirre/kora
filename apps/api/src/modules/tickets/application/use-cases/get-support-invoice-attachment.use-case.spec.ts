import { describe, expect, it, vi } from 'vitest';
import type { SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { GetSupportInvoiceAttachmentUseCase } from './get-support-invoice-attachment.use-case';

describe('Lectura del PDF de una factura', () => {
  it('devuelve los bytes almacenados de la factura solicitada', async () => {
    const attachment = { name: 'factura.pdf', content: 'JVBERi0xLjQ=' };
    const repository = { getAttachment: vi.fn().mockResolvedValue(attachment) };
    const useCase = new GetSupportInvoiceAttachmentUseCase(repository as unknown as SupportInvoiceRepository);
    const result = await useCase.execute({ invoiceId: 'invoice-1' });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(attachment);
    expect(repository.getAttachment).toHaveBeenCalledWith('invoice-1');
  });

  it('devuelve no encontrado cuando solo existe el nombre legado o no existe la factura', async () => {
    const repository = { getAttachment: vi.fn().mockResolvedValue(null) };
    const useCase = new GetSupportInvoiceAttachmentUseCase(repository as unknown as SupportInvoiceRepository);
    const result = await useCase.execute({ invoiceId: 'invoice-1' });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('not_found');
  });
});
