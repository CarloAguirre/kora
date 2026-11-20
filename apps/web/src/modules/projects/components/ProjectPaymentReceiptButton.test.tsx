import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { MAX_PAYMENT_RECEIPT_BYTES } from '@kora/contracts';
import { projectsApi } from '../api/projects.api';
import { projectKeys } from '../api/projects.api';
import { ProjectPaymentReceiptButton } from './ProjectPaymentReceiptButton';

vi.mock('../api/projects.api', async (original) => {
  const module = await original<typeof import('../api/projects.api')>();
  return { ...module, projectsApi: { ...module.projectsApi, uploadPaymentReceipt: vi.fn(), paymentReceipt: vi.fn() } };
});

afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

function show(hasReceipt = false, canManageBilling = true) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = (hasPaymentReceipt: boolean) => (
    <QueryClientProvider client={client}><ToastProvider>
      <ProjectPaymentReceiptButton projectId="project-1" milestoneId="milestone-1" hasPaymentReceipt={hasPaymentReceipt} canManageBilling={canManageBilling} />
    </ToastProvider></QueryClientProvider>
  );
  const result = render(view(hasReceipt));
  return { invalidate, updated: () => result.rerender(view(true)) };
}

describe('Comprobantes de pago en proyectos', () => {
  it.each(['application/pdf', 'image/png', 'image/jpeg'])('adjunta un %s a un pago antiguo y refresca la vista', async (type) => {
    vi.mocked(projectsApi.uploadPaymentReceipt).mockResolvedValue(undefined);
    const { invalidate, updated } = show();
    const file = new File(['receipt bytes'], 'comprobante', { type });
    fireEvent.change(screen.getByLabelText('Subir comprobante'), { target: { files: [file] } });
    await waitFor(() => expect(projectsApi.uploadPaymentReceipt).toHaveBeenCalledWith('project-1', 'milestone-1', file));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    updated();
    expect(screen.getByRole('button', { name: 'Ver comprobante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir comprobante' })).not.toBeInTheDocument();
  });

  it('abre el comprobante en una nueva pestaña sin confundirlo con la factura', async () => {
    const replace = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: {}, closed: false, location: { replace } } as unknown as Window);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:receipt'), revokeObjectURL: vi.fn() }));
    vi.mocked(projectsApi.paymentReceipt).mockResolvedValue(new Blob(['image bytes'], { type: 'image/png' }));
    show(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('blob:receipt'));
    expect(projectsApi.paymentReceipt).toHaveBeenCalledWith('project-1', 'milestone-1');
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(screen.queryByRole('button', { name: 'Ver factura' })).not.toBeInTheDocument();
  });

  it('no permite cargar un comprobante sin permiso de gestion', () => {
    show(false, false);
    expect(screen.queryByRole('button', { name: 'Subir comprobante' })).not.toBeInTheDocument();
  });

  it.each([
    new File(['<svg/>'], 'comprobante.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(MAX_PAYMENT_RECEIPT_BYTES + 1)], 'comprobante.png', { type: 'image/png' }),
  ])('rechaza formatos o tamaños invalidos antes de enviarlos: $name', (file) => {
    show();
    fireEvent.change(screen.getByLabelText('Subir comprobante'), { target: { files: [file] } });
    expect(screen.getByText('Adjunta un PDF o imagen JPG/PNG de hasta 5 MB.')).toBeInTheDocument();
    expect(projectsApi.uploadPaymentReceipt).not.toHaveBeenCalled();
  });

  it('informa errores y mantiene la opcion de reintentar', async () => {
    vi.mocked(projectsApi.uploadPaymentReceipt).mockRejectedValue(new Error('Network failed'));
    show();
    fireEvent.change(screen.getByLabelText('Subir comprobante'), {
      target: { files: [new File(['receipt'], 'comprobante.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante. Inténtalo de nuevo.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Subir comprobante' })).toBeEnabled();
  });
});
