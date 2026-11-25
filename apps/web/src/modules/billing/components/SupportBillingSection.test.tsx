import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ListSupportBillingRowsQuery, SupportBillingRow } from '@kora/contracts';
import { SupportBillingSection } from './SupportBillingSection';

const mockUseSupportBillingRows = vi.hoisted(() => vi.fn());
const mockUseSupportBillingOverview = vi.hoisted(() => vi.fn());
const mockCanManageBilling = vi.hoisted(() => vi.fn());
const mockIssueDialog = vi.hoisted(() => vi.fn());

vi.mock('../api/billing.queries', () => ({
  useSupportBillingOverview: mockUseSupportBillingOverview,
  useSupportBillingRows: mockUseSupportBillingRows,
  useIssueSupportInvoiceFromBilling: () => ({ mutateAsync: vi.fn() }),
  useMarkSupportInvoicePaidFromBilling: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockCanManageBilling }),
}));
vi.mock('@/shared/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn() }),
}));
vi.mock('@/modules/projects/components/IssueSupportInvoiceDialog', () => ({
  IssueSupportInvoiceDialog: (props: unknown) => {
    mockIssueDialog(props);
    return null;
  },
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
  pendingAmountUf: 0,
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
  mockCanManageBilling.mockReset();
  mockCanManageBilling.mockReturnValue(false);
  mockIssueDialog.mockClear();
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
  it('muestra un único título dinámico en el encabezado, no sobre la tabla, y cambia con mes y año', () => {
    show();

    fireEvent.change(screen.getByRole('combobox', { name: 'Mes' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Año' }), { target: { value: '2027' } });

    const periodHeading = screen.getByRole('heading', { level: 2, name: 'Facturación mes de marzo de 2027' });
    expect(periodHeading).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /Facturación mes de/ })).toHaveLength(1);
    expect(periodHeading.closest('table')).toBeNull();
    expect(screen.queryByText('Soporte', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Facturación de soporte de marzo de 2027' }))
      .toBeInTheDocument();
    expect(mockUseSupportBillingOverview).toHaveBeenLastCalledWith('2027-03');
    expect((mockUseSupportBillingRows.mock.lastCall?.[0] as ListSupportBillingRowsQuery).period)
      .toBe('2027-03');

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Facturación mes de febrero de 2027' }))
      .toBeInTheDocument();
  });

  it('desde Registrar factura pasa el mes filtrado y la ruta de historial del contrato al modal', () => {
    mockCanManageBilling.mockReturnValue(true);
    mockUseSupportBillingRows.mockImplementation(() => ({
      data: { items: [{ ...sampleRow, canInvoice: true }], page: 1, pageCount: 1, pageSize: 20, total: 1 },
      isLoading: false,
      error: null,
    }));
    show();

    fireEvent.change(screen.getByRole('combobox', { name: 'Mes' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Año' }), { target: { value: '2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));

    const openCall = mockIssueDialog.mock.calls
      .map(([props]) => props as { open: boolean; periodLabel?: string; historyPath?: string })
      .find((props) => props.open);
    expect(openCall).toMatchObject({
      periodLabel: 'marzo de 2027',
      historyPath: '/soporte/b5b1c217-8585-43f4-b491-8ac94346ef93',
    });
  });

  it('mantiene el nombre sin enlace y agrega Ver facturas junto al contrato', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Soporte Amicar')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Soporte Amicar' })).not.toBeInTheDocument();
    const history = within(table).getByRole('link', {
      name: 'Ver facturas de Soporte Amicar',
    });
    expect(history).toHaveAttribute('href', '/soporte/b5b1c217-8585-43f4-b491-8ac94346ef93');
    expect(history).toHaveTextContent('Ver facturas');
    expect(within(table).getAllByRole('link')).toHaveLength(1);
  });
});
