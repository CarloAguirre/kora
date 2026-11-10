import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api-client';
import { projectsApi } from './projects.api';

afterEach(() => vi.restoreAllMocks());

describe('API de documentos de facturas de proyectos', () => {
  it('envia el comprobante y la fecha al registrar el pago, por separado del PDF de factura', async () => {
    const post = vi.spyOn(api, 'postFormData').mockResolvedValue(undefined);
    const file = new File(['image'], 'boleta.png', { type: 'image/png' });
    await projectsApi.markPaymentMilestonePaid('project-1', 'milestone-1', { paidAt: '2026-11-10', file });
    expect(post).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/paid/upload', expect.any(FormData));
    const body = post.mock.calls[0]![1];
    expect(body.get('file_0')).toBe(file);
    expect(JSON.parse(String(body.get('metadata')))).toEqual({ paidAt: '2026-11-10' });
  });

  it('mantiene la ruta de pago original cuando no hay comprobante', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(undefined);
    await projectsApi.markPaymentMilestonePaid('project-1', 'milestone-1', { paidAt: '2026-11-10' });
    expect(patch).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/paid', { paidAt: '2026-11-10' });
  });

  it('adjunta un comprobante sin modificar el pago ni el archivo de factura', async () => {
    const post = vi.spyOn(api, 'postFormData').mockResolvedValue(undefined);
    const file = new File(['image'], 'boleta.jpg', { type: 'image/jpeg' });
    await projectsApi.uploadPaymentReceipt('project-1', 'milestone-1', file);
    expect(post).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/payment-receipt', expect.any(FormData));
    expect(post.mock.calls[0]![1].get('file')).toBe(file);
  });

  it('envia metadata y bytes reales como multipart al registrar la factura', async () => {
    const post = vi.spyOn(api, 'postFormData').mockResolvedValue(undefined);
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    await projectsApi.issuePaymentMilestoneInvoice('project-1', 'milestone-1', {
      folio: '4444', issuedAt: '2026-11-10', pauseForManagementApproval: true, file,
    });
    expect(post).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/invoice/upload', expect.any(FormData));
    const body = post.mock.calls[0]![1];
    expect(body.get('file_0')).toBe(file);
    expect(JSON.parse(String(body.get('metadata')))).toEqual({
      folio: '4444', issuedAt: '2026-11-10', pauseForManagementApproval: true,
    });
  });

  it('mantiene la ruta JSON cuando no se adjunta un archivo', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(undefined);
    const input = { folio: '4444', issuedAt: '2026-11-10' };
    await projectsApi.issuePaymentMilestoneInvoice('project-1', 'milestone-1', input);
    expect(post).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/invoice', input);
  });

  it('completa un documento sin volver a registrar la factura', async () => {
    const post = vi.spyOn(api, 'postFormData').mockResolvedValue(undefined);
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    await projectsApi.uploadInvoiceAttachment('project-1', 'milestone-1', file);
    expect(post).toHaveBeenCalledWith('/projects/project-1/payment-milestones/milestone-1/attachment', expect.any(FormData));
    expect(post.mock.calls[0]![1].get('file')).toBe(file);
  });
});
