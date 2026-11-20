import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { ViewSupportInvoiceButton } from './ViewSupportInvoiceButton';
import { supportPlanApi } from '../api/support-plan.api';

vi.mock('../api/support-plan.api', () => ({ supportPlanApi: { invoiceAttachment: vi.fn() } }));

beforeEach(() => {
  vi.mocked(supportPlanApi.invoiceAttachment).mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:invoice'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function show() {
  render(<ToastProvider><ViewSupportInvoiceButton invoiceId="invoice-1" /></ToastProvider>);
}

describe('Ver factura', () => {
  it('abre una nueva pestaña y muestra el PDF obtenido por la API autenticada', async () => {
    const replace = vi.fn();
    const tab = { opener: {}, closed: false, location: { replace }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.mocked(supportPlanApi.invoiceAttachment).mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('blob:invoice'));
    expect(tab.opener).toBeNull();
    expect(supportPlanApi.invoiceAttachment).toHaveBeenCalledWith('invoice-1');
  });

  it('informa si el navegador bloquea la pestaña', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    expect(screen.getByText(/El navegador bloqueó la pestaña/)).toBeInTheDocument();
    expect(supportPlanApi.invoiceAttachment).not.toHaveBeenCalled();
  });

  it('cierra la pestaña vacia e informa si falla la lectura', async () => {
    const close = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, close } as unknown as Window);
    vi.mocked(supportPlanApi.invoiceAttachment).mockRejectedValue(new Error('Network error'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(screen.getByText(/No se pudo abrir la factura/)).toBeInTheDocument();
  });
});
