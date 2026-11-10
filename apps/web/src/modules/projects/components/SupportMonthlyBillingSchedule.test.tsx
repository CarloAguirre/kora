import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SupportMonthlyBillingPeriod } from '@kora/contracts';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { SupportMonthlyBillingSchedule } from './SupportMonthlyBillingSchedule';

const period: SupportMonthlyBillingPeriod = {
  monthlyPeriodId: 'period-1', periodKey: '2026-01', startDate: '2026-01-01', endDate: '2026-02-01',
  isCurrent: false, status: 'invoiced', amountUf: 7.1,
  invoices: [{ id: 'invoice-1', folio: '4444', amountUf: 7.1, paymentStatus: 'pending', hasAttachment: true }],
};

function show(value = period, canManageBilling = true) {
  const onIssue = vi.fn();
  render(<ToastProvider><SupportMonthlyBillingSchedule periods={[value]} currency="UF" canManageBilling={canManageBilling} onIssue={onIssue} /></ToastProvider>);
  return onIssue;
}

describe('Meses del contrato: acciones de factura', () => {
  it('reemplaza Registrar factura por Ver factura cuando tiene PDF', () => {
    show();
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar factura' })).not.toBeInTheDocument();
  });

  it('permite ver sin permiso para modificar facturacion', () => {
    show(period, false);
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeEnabled();
  });

  it('no inventa enlaces para facturas antiguas sin PDF', () => {
    show({ ...period, invoices: [{ ...period.invoices[0]!, hasAttachment: false }] });
    expect(screen.queryByRole('button', { name: 'Ver factura' })).not.toBeInTheDocument();
  });

  it('muestra un boton identificado por folio por cada PDF', () => {
    show({ ...period, invoices: [...period.invoices, { ...period.invoices[0]!, id: 'invoice-2', folio: '5555' }] });
    expect(screen.getByRole('button', { name: 'Ver factura 4444' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver factura 5555' })).toBeInTheDocument();
  });

  it('mantiene el registro de los meses pendientes', () => {
    const pending = { ...period, status: 'to_invoice' as const, invoices: [] };
    const onIssue = show(pending);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));
    expect(onIssue).toHaveBeenCalledWith(pending);
  });
});
