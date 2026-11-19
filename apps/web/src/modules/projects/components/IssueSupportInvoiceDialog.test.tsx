import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IssueSupportInvoiceDialog } from './IssueSupportInvoiceDialog';

const planPath = '/soporte/b5b1c217-8585-43f4-b491-8ac94346ef93';

function renderDialog({ periodLabel, historyPath }: { periodLabel?: string; historyPath?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={['/facturacion']}>
      <Routes>
        <Route path="/facturacion" element={
          <IssueSupportInvoiceDialog
            open
            description="Soporte Amicar · 7,10 UF"
            totalAmount={7.1}
            currency="UF"
            periodLabel={periodLabel}
            historyPath={historyPath}
            onClose={vi.fn()}
            onConfirm={vi.fn().mockResolvedValue(undefined)}
          />
        } />
        <Route path="/soporte/:planId" element={<h1>Historial de facturaciones del contrato</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Registrar factura desde Facturación: período e historial', () => {
  it('incluye el mes seleccionado en el título y navega al historial correcto del contrato', () => {
    renderDialog({ periodLabel: 'noviembre de 2026', historyPath: planPath });
    const dialog = screen.getByRole('dialog', { name: 'Registrar factura · noviembre de 2026' });
    expect(within(dialog).getByText('Soporte Amicar · 7,10 UF')).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: 'Ver facturas' });
    expect(link).toHaveAttribute('href', planPath);
    expect(link.closest('footer')).toBe(dialog.querySelector('footer'));
    expect(dialog.querySelector('header')).not.toContainElement(link);
    const footer = within(dialog.querySelector('footer')!);
    expect(footer.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(footer.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(link.compareDocumentPosition(footer.getByRole('button', { name: 'Cancelar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(link);
    expect(screen.getByRole('heading', { name: 'Historial de facturaciones del contrato' })).toBeInTheDocument();
  });

  it('mantiene el contexto del período al dividir en varias facturas', () => {
    renderDialog({ periodLabel: 'marzo de 2027', historyPath: planPath });
    fireEvent.click(screen.getByRole('button', { name: 'Dividir en varias facturas' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar facturas · marzo de 2027' });
    const link = within(dialog).getByRole('link', { name: 'Ver facturas' });
    expect(link).toHaveAttribute('href', planPath);
    expect(link.closest('footer')).toBe(dialog.querySelector('footer'));
  });

  it('conserva el título original sin enlace en invocaciones que no pasan el período ni el destino', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Registrar factura' });
    expect(within(dialog).queryByRole('link', { name: 'Ver facturas' })).not.toBeInTheDocument();
  });
});
