import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IssueProjectMilestoneInvoiceDialog } from './IssueProjectMilestoneInvoiceDialog';

describe('Registro de factura de proyecto con PDF', () => {
  it('conserva el archivo real y la opcion de Hito 0 al enviar el formulario', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<IssueProjectMilestoneInvoiceDialog open milestoneName="Inicio" amount={100} onClose={vi.fn()} onConfirm={confirm} showHito0Notice />);
    fireEvent.change(screen.getByLabelText('N° de documento (folio)'), { target: { value: '4444' } });
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adjuntar factura (PDF, opcional)'), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText('Dejar en espera de aprobación de Gerencia'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      folio: '4444', file, attachmentName: 'factura.pdf', pauseForManagementApproval: true,
    })));
  });

  it('mantiene el registro sin PDF como opcion valida', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<IssueProjectMilestoneInvoiceDialog open milestoneName="Inicio" amount={100} onClose={vi.fn()} onConfirm={confirm} />);
    fireEvent.change(screen.getByLabelText('N° de documento (folio)'), { target: { value: '4444' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ file: undefined, folio: '4444' })));
  });

  it('rechaza archivos no PDF antes de registrar la factura', () => {
    const confirm = vi.fn();
    render(<IssueProjectMilestoneInvoiceDialog open milestoneName="Inicio" amount={100} onClose={vi.fn()} onConfirm={confirm} />);
    fireEvent.change(screen.getByLabelText('Adjuntar factura (PDF, opcional)'), {
      target: { files: [new File(['text'], 'factura.txt', { type: 'text/plain' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Adjunta un archivo PDF de hasta 5 MB.');
    expect(confirm).not.toHaveBeenCalled();
  });
});
