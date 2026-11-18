import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ListSupportBillingRowsQuery, SupportBillingRow } from '@kora/contracts';
import { SupportBillingSection } from './SupportBillingSection';

const mockUseSupportBillingRows = vi.hoisted(() => vi.fn());
const mockUseSupportBillingOverview = vi.hoisted(() => vi.fn());

vi.mock('../api/billing.queries', () => ({
  useSupportBillingOverview: mockUseSupportBillingOverview,
  useSupportBillingRows: mockUseSupportBillingRows,
  useIssueSupportInvoiceFromBilling: () => ({ mutateAsync: vi.fn() }),
  useMarkSupportInvoicePaidFromBilling: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn() }),
}));
vi.mock('@/modules/projects/components/IssueSupportInvoiceDialog', () => ({
  IssueSupportInvoiceDialog: () => null,
}));
vi.mock('@/modules/projects/components/MarkSupportInvoicePaidDialog', () => ({
  MarkSupportInvoicePaidDialog: () => null,
}));

const sampleRow = {
  planId: 'b5b1c217-8585-43f4-b491-8ac94346ef93',
  planName: 'Soporte Amicar',
  clientId: '8a15a628-d893-493c-a7b3-f46f6383a785',
  clientName: 'Amicar',
  scope: 'single',
  planType: 'monthly',
  amountUf: 7.1,
  currency: 'UF',
  billingStatus: null,
  paymentStatus: null,
  invoices: [],
  canInvoice: false,
  hasAlert: false,
  alerts: [],
  isOverdue: false,
} as SupportBillingRow;

beforeEach(() => {
  mockUseSupportBillingOverview.mockReset();
  mockUseSupportBillingRows.mockReset();
  mockUseSupportBillingOverview.mockImplementation(() => ({
    data: { clients: [], perCurrency: [], alertsCount: 0 },
    isLoading: false,
  }));
  mockUseSupportBillingRows.mockImplementation(() => ({
    data: { items: [sampleRow], page: 1, pageCount: 1, pageSize: 20, total: 1 },
    isLoading: false,
    error: null,
  }));
});

function show() {
  render(<MemoryRouter><SupportBillingSection /></MemoryRouter>);
}

describe('Facturación de Soporte: período visible e historial por contrato', () => {
  it('muestra el período seleccionado sobre la tabla y cambia con mes y año', () => {
    show();

    fireEvent.change(screen.getByRole('combobox', { name: 'Mes' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Año' }), { target: { value: '2027' } });

    expect(screen.getByRole('heading', { level: 2, name: 'Facturación mes de marzo de 2027' }))
      .toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Facturación de soporte de marzo de 2027' }))
      .toBeInTheDocument();
    expect(mockUseSupportBillingOverview).toHaveBeenLastCalledWith('2027-03');
    expect((mockUseSupportBillingRows.mock.lastCall?.[0] as ListSupportBillingRowsQuery).period)
      .toBe('2027-03');

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Facturación mes de febrero de 2027' }))
      .toBeInTheDocument();
  });

  it('mantiene el nombre y agrega Ver historial junto al contrato enlazando su ficha', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Soporte Amicar')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Soporte Amicar' })).not.toBeInTheDocument();
    const history = within(table).getByRole('link', {
      name: 'Ver historial de facturación de Soporte Amicar',
    });
    expect(history).toHaveAttribute('href', '/soporte/b5b1c217-8585-43f4-b491-8ac94346ef93');
    expect(history).toHaveTextContent('Ver historial');
    expect(within(table).getAllByRole('link')).toHaveLength(1);
  });
});
