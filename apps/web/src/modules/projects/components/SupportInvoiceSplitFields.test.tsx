import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useSupportInvoiceSplit, SupportInvoiceSplitFields } from './SupportInvoiceSplitFields';

function Form({ save }: { save: (input: unknown) => void }) {
  const split = useSupportInvoiceSplit(10);
  return (
    <>
      <SupportInvoiceSplitFields split={split} currency="UF" />
      <button onClick={() => save(split.toInput())}>Guardar prueba</button>
      <button onClick={() => save(split.validate())}>Validar prueba</button>
    </>
  );
}

describe('Adjuntos en el registro de facturas', () => {
  it('conserva el archivo real, no solo el nombre', () => {
    const save = vi.fn();
    render(<Form save={save} />);
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adjuntar PDF (opcional)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prueba' }));
    expect(save).toHaveBeenLastCalledWith([expect.objectContaining({ file, attachmentName: 'factura.pdf' })]);
  });

  it('mantiene cada adjunto al dividir el monto', () => {
    const save = vi.fn();
    const { container } = render(<Form save={save} />);
    const first = new File(['%PDF-first'], 'primera.pdf', { type: 'application/pdf' });
    const second = new File(['%PDF-second'], 'segunda.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adjuntar PDF (opcional)'), { target: { files: [first] } });
    fireEvent.click(screen.getByRole('button', { name: 'Dividir en varias facturas' }));
    const files = container.querySelectorAll('input[type="file"]');
    fireEvent.change(files[1]!, { target: { files: [second] } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prueba' }));
    expect(save).toHaveBeenLastCalledWith([
      expect.objectContaining({ file: first, attachmentName: 'primera.pdf' }),
      expect.objectContaining({ file: second, attachmentName: 'segunda.pdf' }),
    ]);
  });
});
