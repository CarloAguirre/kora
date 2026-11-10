import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { SupportInvoiceDocumentButton } from './SupportInvoiceDocumentButton';
import { supportPlanApi, supportPlanKeys } from '../api/support-plan.api';
import { ApiRequestError } from '@/shared/lib/api-client';

vi.mock('../api/support-plan.api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/support-plan.api')>();
  return { ...original, supportPlanApi: { ...original.supportPlanApi, uploadInvoiceAttachment: vi.fn() } };
});

afterEach(() => vi.resetAllMocks());

function show() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = (hasAttachment = false) => (
    <QueryClientProvider client={client}><ToastProvider>
      <SupportInvoiceDocumentButton invoiceId="invoice-1" hasAttachment={hasAttachment} canManageBilling />
    </ToastProvider></QueryClientProvider>
  );
  const result = render(view());
  return { invalidate, updated: () => result.rerender(view(true)) };
}

describe('Subir documento de una factura registrada', () => {
  it('envia el PDF a la factura correcta e invalida el detalle para mostrar Ver factura', async () => {
    vi.mocked(supportPlanApi.uploadInvoiceAttachment).mockResolvedValue(undefined);
    const { invalidate, updated } = show();
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Subir documento'), { target: { files: [file] } });
    await waitFor(() => expect(supportPlanApi.uploadInvoiceAttachment).toHaveBeenCalledWith('invoice-1', file));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: supportPlanKeys.details() }));
    updated();
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
  });

  it('rechaza archivos que no son PDF sin enviarlos', () => {
    show();
    fireEvent.change(screen.getByLabelText('Subir documento'), { target: { files: [new File(['no'], 'archivo.txt', { type: 'text/plain' })] } });
    expect(screen.getByText('Adjunta un archivo PDF de hasta 5 MB.')).toBeInTheDocument();
    expect(supportPlanApi.uploadInvoiceAttachment).not.toHaveBeenCalled();
  });

  it('informa errores del servidor y conserva la opcion de reintentar', async () => {
    vi.mocked(supportPlanApi.uploadInvoiceAttachment).mockRejectedValue(new ApiRequestError(409, {
      code: 'INVOICE_ATTACHMENT_EXISTS', kind: 'conflict', message: 'La factura ya tiene un documento adjunto.',
    }));
    show();
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Subir documento'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('La factura ya tiene un documento adjunto.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled();
  });
});
