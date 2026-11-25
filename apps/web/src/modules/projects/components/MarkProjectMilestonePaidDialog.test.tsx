import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarkProjectMilestonePaidDialog } from './MarkProjectMilestonePaidDialog';

describe('Registrar pago con comprobante', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png'])('conserva el archivo %s real al guardar el pago', async (type) => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<MarkProjectMilestonePaidDialog open milestoneName="Inicio" onClose={vi.fn()} onConfirm={confirm} />);
    const file = new File(['receipt bytes'], 'boleta', { type });
    fireEvent.change(screen.getByLabelText('Adjuntar comprobante (opcional)'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Fecha de pago'), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ paidAt: '2026-11-10', attachmentName: 'boleta', file }));
  });

  it('permite registrar el pago sin archivo', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<MarkProjectMilestonePaidDialog open milestoneName="Inicio" onClose={vi.fn()} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ file: undefined, attachmentName: undefined })));
  });

  it('rechaza otros formatos sin marcar el tramo como pagado', () => {
    const confirm = vi.fn();
    render(<MarkProjectMilestonePaidDialog open milestoneName="Inicio" onClose={vi.fn()} onConfirm={confirm} />);
    fireEvent.change(screen.getByLabelText('Adjuntar comprobante (opcional)'), {
      target: { files: [new File(['text'], 'boleta.txt', { type: 'text/plain' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Adjunta un PDF o imagen JPG/PNG de hasta 5 MB.');
    expect(confirm).not.toHaveBeenCalled();
  });
});
