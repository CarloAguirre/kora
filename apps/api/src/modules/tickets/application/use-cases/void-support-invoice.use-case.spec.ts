import { describe, expect, it } from 'vitest';
import type { AuditEntry, AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { SupportInvoiceRecord, SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { VoidSupportInvoiceUseCase } from './void-support-invoice.use-case';

class FakeInvoices implements Pick<SupportInvoiceRepository, 'findById' | 'remove'> {
  removed: string[] = [];
  constructor(private readonly invoice: SupportInvoiceRecord | null) {}
  async findById(): Promise<SupportInvoiceRecord | null> {
    return this.invoice;
  }
  async remove(id: string): Promise<void> {
    this.removed.push(id);
  }
}

class FakeAudit implements AuditRecorder {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

const invoice = (overrides: Partial<SupportInvoiceRecord> = {}): SupportInvoiceRecord => ({
  id: 'invoice-1',
  planId: 'plan-1',
  periodKey: '2026-10',
  amountUf: 25,
  currency: 'USD',
  hoursBilled: null,
  folio: '94',
  invoicedAt: new Date('2026-10-29T00:00:00Z'),
  dueAt: new Date('2026-11-28T00:00:00Z'),
  paidAt: null,
  attachmentName: null,
  monthlyPeriodId: 'period-1',
  ...overrides,
});

const actor = { userId: 'user-1', email: 'pmo@kabeli.cl' };

function build(record: SupportInvoiceRecord | null) {
  const invoices = new FakeInvoices(record);
  const audit = new FakeAudit();
  const useCase = new VoidSupportInvoiceUseCase(invoices as unknown as SupportInvoiceRepository, audit);
  return { useCase, invoices, audit };
}

describe('VoidSupportInvoiceUseCase', () => {
  it('anula una factura pendiente de pago y deja en la auditoría su folio y monto', async () => {
    const { useCase, invoices, audit } = build(invoice());
    const result = await useCase.execute({ invoiceId: 'invoice-1', actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.removed).toEqual(['invoice-1']);
    expect(audit.entries[0]).toMatchObject({
      action: 'delete',
      entityType: 'support_invoice',
      metadata: { folio: '94', amountUf: 25, periodKey: '2026-10' },
    });
  });

  it('no anula una factura ya pagada', async () => {
    const { useCase, invoices } = build(invoice({ paidAt: new Date('2026-11-05T00:00:00Z') }));
    const result = await useCase.execute({ invoiceId: 'invoice-1', actor });
    expect(result.isErr()).toBe(true);
    expect(invoices.removed).toEqual([]);
  });

  it('responde no encontrada si la factura no existe', async () => {
    const { useCase } = build(null);
    const result = await useCase.execute({ invoiceId: 'nope', actor });
    expect(result.isErr()).toBe(true);
  });
});
