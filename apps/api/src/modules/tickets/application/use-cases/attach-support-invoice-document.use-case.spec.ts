import { describe, expect, it, vi } from 'vitest';
import type { SupportInvoiceRepository, SupportInvoiceRecord } from '../../domain/repositories/support-invoice.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { AttachSupportInvoiceDocumentUseCase } from './attach-support-invoice-document.use-case';

const command = {
  invoiceId: 'invoice-1',
  attachment: { name: 'factura.pdf', content: 'JVBERi0xLjQ=' },
  actor: { userId: 'pmo-1', email: 'pmo@example.test' },
};

function setup(invoice: Partial<SupportInvoiceRecord> | null = { attachmentName: 'legado.pdf', hasAttachment: false }, inserted = true) {
  const invoices = {
    findById: vi.fn().mockResolvedValue(invoice),
    attachDocument: vi.fn().mockResolvedValue(inserted),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const useCase = new AttachSupportInvoiceDocumentUseCase(
    invoices as unknown as SupportInvoiceRepository, audit as AuditRecorder,
  );
  return { useCase, invoices, audit };
}

describe('Adjuntar documento a una factura existente', () => {
  it('agrega el PDF de una factura legada sin volver a registrar sus datos', async () => {
    const { useCase, invoices, audit } = setup();
    expect((await useCase.execute(command)).isOk()).toBe(true);
    expect(invoices.attachDocument).toHaveBeenCalledWith(command.invoiceId, command.attachment);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update', entityId: command.invoiceId, metadata: { attachmentName: 'factura.pdf' },
    }));
  });

  it('permite completar el documento de una factura ya pagada', async () => {
    const { useCase } = setup({ paidAt: new Date(), hasAttachment: false });
    expect((await useCase.execute(command)).isOk()).toBe(true);
  });

  it('rechaza facturas inexistentes', async () => {
    const { useCase, invoices, audit } = setup(null);
    const result = await useCase.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('not_found');
    expect(invoices.attachDocument).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('no reemplaza un documento existente', async () => {
    const { useCase, invoices } = setup({ hasAttachment: true });
    const result = await useCase.execute(command);
    if (result.isErr()) expect(result.error.code).toBe('INVOICE_ATTACHMENT_EXISTS');
    expect(result.isErr()).toBe(true);
    expect(invoices.attachDocument).not.toHaveBeenCalled();
  });

  it('informa conflicto si otra solicitud adjunto el archivo primero', async () => {
    const { useCase, audit } = setup({ hasAttachment: false }, false);
    const result = await useCase.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('conflict');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
