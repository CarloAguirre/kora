import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BillingLedgerEntry } from '@kora/contracts';
import { ToastProvider } from '@/shared/components/ui/Toast';
import { projectsApi } from '@/modules/projects/api/projects.api';
import { ProjectsBillingSection } from './ProjectsBillingSection';

let canManage = true;
let entries: BillingLedgerEntry[] = [];

vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => permission === 'billing:read' || (canManage && permission === 'billing:manage') }),
}));
vi.mock('../api/billing.queries', () => ({ useBillingLedger: () => ({ data: { entries }, isLoading: false }) }));
vi.mock('@/modules/projects/api/projects.queries', async (original) => {
  const module = await original<typeof import('@/modules/projects/api/projects.queries')>();
  return { ...module, useProjectDetail: () => ({ data: undefined }) };
});

const row: BillingLedgerEntry = {
  id: 'milestone-1', line: 'proyecto', clientId: 'client-1', clientName: 'Cliente',
  detail: 'Portal — Inicio', projectId: 'project-1', projectName: 'Portal', milestoneName: 'Inicio',
  amount: 100, currency: 'UF', folio: '4444', issuedAt: '2026-11-10', status: 'facturado',
  paidAt: null, dueAt: '2026-12-10', referenceId: 'milestone-1', milestonePercent: 50,
  milestoneTriggerType: 'manual', milestoneTriggerDate: null, milestoneTriggerPhase: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  canManage = true;
  entries = [{ ...row, hasAttachment: false }];
});

function show() {
  render(<QueryClientProvider client={new QueryClient()}><ToastProvider><ProjectsBillingSection /></ToastProvider></QueryClientProvider>);
}

describe('Facturacion > Proyectos: documentos en la tabla', () => {
  it('muestra la factura y el comprobante como documentos independientes de un pago', () => {
    entries = [{ ...row, status: 'pagado', hasAttachment: true, hasPaymentReceipt: true }];
    show();
    const table = screen.getByRole('table', { name: 'Tramos de pago de proyectos' });
    expect(within(table).getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Ver comprobante' })).toBeInTheDocument();
  });

  it('permite completar comprobantes faltantes de pagos antiguos', () => {
    entries = [{ ...row, status: 'pagado', hasAttachment: true, hasPaymentReceipt: false }];
    show();
    expect(screen.getByRole('button', { name: 'Subir comprobante' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
  });

  it('no ofrece subir comprobantes antes del pago', () => {
    show();
    expect(screen.queryByRole('button', { name: 'Subir comprobante' })).not.toBeInTheDocument();
  });

  it('envia la imagen real al marcar la factura como pagada desde la tabla', async () => {
    const pay = vi.spyOn(projectsApi, 'markPaymentMilestonePaid').mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagado' }));
    const file = new File(['image'], 'boleta.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Adjuntar comprobante (opcional)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(pay).toHaveBeenCalledWith(
      'project-1', 'milestone-1', expect.objectContaining({ file, attachmentName: 'boleta.png' }),
    ));
  });

  it('muestra Subir documento junto a la factura registrada y Ver factura junto a la que tiene PDF', () => {
    entries.push({ ...row, id: 'milestone-2', referenceId: 'milestone-2', hasAttachment: true, status: 'pagado' });
    show();
    const table = screen.getByRole('table', { name: 'Tramos de pago de proyectos' });
    expect(within(table).getByRole('button', { name: 'Subir documento' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Ver factura' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Subir factura' })).not.toBeInTheDocument();
  });

  it('no ofrece cargar documentos a usuarios de solo lectura', () => {
    canManage = false;
    show();
    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
  });

  it('conserva el PDF a traves del formulario y la mutacion al registrar un tramo pendiente', async () => {
    entries = [{ ...row, status: 'por_facturar', folio: null, issuedAt: null }];
    const issue = vi.spyOn(projectsApi, 'issuePaymentMilestoneInvoice').mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Subir factura' }));
    fireEvent.change(screen.getByLabelText('N° de documento (folio)'), { target: { value: '5555' } });
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adjuntar factura (PDF, opcional)'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(issue).toHaveBeenCalledWith(
      'project-1', 'milestone-1', expect.objectContaining({ file, folio: '5555' }),
    ));
  });
});
