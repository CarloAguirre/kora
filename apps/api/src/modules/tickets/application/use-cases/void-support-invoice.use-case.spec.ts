import { describe, expect, it } from 'vitest';
import type { AuditEntry, AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { SupportInvoiceRecord, SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { VoidSupportInvoiceUseCase } from './void-support-invoice.use-case';

class FakeInvoices implements Pick<SupportInvoiceRepository, 'findById' | 'listByPlanAndPeriod' | 'removeMany'> {
  removed: string[] = [];
  constructor(private readonly records: SupportInvoiceRecord[]) {}
  async findById(id: string): Promise<SupportInvoiceRecord | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }
  async listByPlanAndPeriod(planId: string, periodKey: string): Promise<SupportInvoiceRecord[]> {
    return this.records.filter((record) => record.planId === planId && record.periodKey === periodKey);
  }
  async removeMany(ids: readonly string[]): Promise<void> {
    this.removed.push(...ids);
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
  position: 0,
  folio: '94',
  invoicedAt: new Date('2026-10-29T00:00:00Z'),
  dueAt: new Date('2026-11-28T00:00:00Z'),
  paidAt: null,
  attachmentName: null,
  monthlyPeriodId: 'period-1',
  ...overrides,
});

const actor = { userId: 'user-1', email: 'pmo@kabeli.cl' };

function build(...records: SupportInvoiceRecord[]) {
  const invoices = new FakeInvoices(records);
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

  it('anula juntas todas las facturas en que se dividió el período', async () => {
    const { useCase, invoices, audit } = build(
      invoice({ amountUf: 100 }),
      invoice({ id: 'invoice-2', folio: '95', position: 1, amountUf: 34.81 }),
      invoice({ id: 'other-period', periodKey: '2026-09' }),
    );
    const result = await useCase.execute({ invoiceId: 'invoice-2', actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.removed).toEqual(['invoice-1', 'invoice-2']);
    expect(audit.entries.map((entry) => entry.metadata)).toMatchObject([{ folio: '94' }, { folio: '95' }]);
  });

  it('no anula el período si otra de sus facturas ya está pagada', async () => {
    const { useCase, invoices } = build(
      invoice({ paidAt: new Date('2026-11-05T00:00:00Z') }),
      invoice({ id: 'invoice-2', folio: '95', position: 1 }),
    );
    const result = await useCase.execute({ invoiceId: 'invoice-2', actor });
    expect(result.isErr()).toBe(true);
    expect(invoices.removed).toEqual([]);
  });

  it('responde no encontrada si la factura no existe', async () => {
    const { useCase } = build();
    const result = await useCase.execute({ invoiceId: 'nope', actor });
    expect(result.isErr()).toBe(true);
  });
});
