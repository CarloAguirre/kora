import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { projectsApi } from '../api/projects.api';
import { projectKeys } from '../api/projects.api';
import { ProjectInvoiceDocumentButton } from './ProjectInvoiceDocumentButton';

vi.mock('../api/projects.api', async (original) => {
  const module = await original<typeof import('../api/projects.api')>();
  return { ...module, projectsApi: { ...module.projectsApi, uploadInvoiceAttachment: vi.fn(), invoiceAttachment: vi.fn() } };
});

afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

function show(hasAttachment = false, canManageBilling = true) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = (hasPdf: boolean) => (
    <QueryClientProvider client={client}><ToastProvider>
      <ProjectInvoiceDocumentButton projectId="project-1" milestoneId="milestone-1" hasAttachment={hasPdf} canManageBilling={canManageBilling} />
    </ToastProvider></QueryClientProvider>
  );
  const result = render(view(hasAttachment));
  return { invalidate, updated: () => result.rerender(view(true)) };
}

describe('Documentos de facturas de proyectos', () => {
  it('sube el documento a su tramo y refresca tanto Facturacion como la ficha del proyecto', async () => {
    vi.mocked(projectsApi.uploadInvoiceAttachment).mockResolvedValue(undefined);
    const { invalidate, updated } = show();
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Subir documento'), { target: { files: [file] } });
    await waitFor(() => expect(projectsApi.uploadInvoiceAttachment).toHaveBeenCalledWith('project-1', 'milestone-1', file));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    updated();
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
  });

  it('abre el PDF en otra pestaña mediante el endpoint de proyectos', async () => {
    const replace = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ opener: {}, closed: false, location: { replace } } as unknown as Window);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:project-invoice'), revokeObjectURL: vi.fn() }));
    vi.mocked(projectsApi.invoiceAttachment).mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    show(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('blob:project-invoice'));
    expect(projectsApi.invoiceAttachment).toHaveBeenCalledWith('project-1', 'milestone-1');
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
  });

  it('no muestra la carga a quien no puede gestionar facturacion', () => {
    show(false, false);
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
  });

  it('informa un error de carga y permite volver a intentarlo', async () => {
    vi.mocked(projectsApi.uploadInvoiceAttachment).mockRejectedValue(new Error('Network failed'));
    show();
    fireEvent.change(screen.getByLabelText('Subir documento'), {
      target: { files: [new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(screen.getByText('No se pudo subir el documento. Inténtalo de nuevo.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled();
  });
});
