import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api-client';
import { projectsApi } from './projects.api';

afterEach(() => vi.restoreAllMocks());

describe('API de documentos de facturas de proyectos', () => {
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
