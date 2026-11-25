import { describe, expect, it } from 'vitest';
import type { UnitOfWork } from '@kora/core';
import type { AuditEntry, AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { SupportInvoiceRecord, SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { VoidSupportInvoiceUseCase } from './void-support-invoice.use-case';

class FakeInvoices implements Pick<SupportInvoiceRepository, 'findById' | 'listByPlanAndPeriod' | 'removeMany' | 'setPeriodTarget' | 'setHoursBilled'> {
  removed: string[] = [];
  periodTarget: { periodKey: string; targetAmountUf: number | null } | null = null;
  hoursBilled: { id: string; hoursBilled: number | null } | null = null;
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
  async setPeriodTarget(_planId: string, periodKey: string, targetAmountUf: number | null): Promise<void> {
    this.periodTarget = { periodKey, targetAmountUf };
  }
  async setHoursBilled(id: string, hoursBilled: number | null): Promise<void> {
    this.hoursBilled = { id, hoursBilled };
  }
}

class FakeTickets implements Pick<TicketRepository, 'moveInvoiceLinks'> {
  moved: { from: string; to: string } | null = null;
  async moveInvoiceLinks(fromInvoiceId: string, toInvoiceId: string): Promise<void> {
    this.moved = { from: fromInvoiceId, to: toInvoiceId };
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
  targetAmountUf: null,
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
  const tickets = new FakeTickets();
  const audit = new FakeAudit();
  const useCase = new VoidSupportInvoiceUseCase(
    invoices as unknown as SupportInvoiceRepository,
    tickets as unknown as TicketRepository,
    audit,
    { run: async (work: (tx: unknown) => Promise<unknown>) => work({}) } as unknown as UnitOfWork,
  );
  return { useCase, invoices, tickets, audit };
}

describe('VoidSupportInvoiceUseCase', () => {
  it('anula la única factura del período (vuelve a quedar por facturar) y deja en la auditoría su folio y monto', async () => {
    const { useCase, invoices, audit } = build(invoice());
    const result = await useCase.execute({ invoiceId: 'invoice-1', actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.removed).toEqual(['invoice-1']);
    expect(invoices.periodTarget).toBeNull();
    expect(audit.entries[0]).toMatchObject({
      action: 'delete',
      entityType: 'support_invoice',
      metadata: { folio: '94', amountUf: 25, periodKey: '2026-10', remainingInPeriod: 0 },
    });
  });

  it('no anula una factura ya pagada', async () => {
    const { useCase, invoices } = build(invoice({ paidAt: new Date('2026-11-05T00:00:00Z') }));
    const result = await useCase.execute({ invoiceId: 'invoice-1', actor });
    expect(result.isErr()).toBe(true);
    expect(invoices.removed).toEqual([]);
  });

  it('anula solo la factura pedida de un período dividido: su monto vuelve a quedar por facturar', async () => {
    const { useCase, invoices } = build(
      invoice({ amountUf: 100, hoursBilled: 4 }),
      invoice({ id: 'invoice-2', folio: '95', position: 1, amountUf: 34.81 }),
      invoice({ id: 'other-period', periodKey: '2026-09' }),
    );
    const result = await useCase.execute({ invoiceId: 'invoice-2', actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.removed).toEqual(['invoice-2']);
    expect(invoices.periodTarget).toEqual({ periodKey: '2026-10', targetAmountUf: 134.81 });
    // Las horas y los tickets ya están en la primera, que se mantiene.
    expect(invoices.hoursBilled).toBeNull();
  });

  it('al anular la primera, sus horas y tickets pasan a la siguiente del período', async () => {
    const { useCase, invoices, tickets } = build(
      invoice({ amountUf: 100, hoursBilled: 4 }),
      invoice({ id: 'invoice-2', folio: '95', position: 1, amountUf: 34.81 }),
    );
    await useCase.execute({ invoiceId: 'invoice-1', actor });
    expect(invoices.removed).toEqual(['invoice-1']);
    expect(invoices.hoursBilled).toEqual({ id: 'invoice-2', hoursBilled: 4 });
    expect(tickets.moved).toEqual({ from: 'invoice-1', to: 'invoice-2' });
    expect(invoices.periodTarget).toEqual({ periodKey: '2026-10', targetAmountUf: 134.81 });
  });

  it('una factura pagada del mismo período no impide anular otra', async () => {
    const { useCase, invoices } = build(
      invoice({ paidAt: new Date('2026-11-05T00:00:00Z') }),
      invoice({ id: 'invoice-2', folio: '95', position: 1 }),
    );
    const result = await useCase.execute({ invoiceId: 'invoice-2', actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.removed).toEqual(['invoice-2']);
  });

  it('mantiene el total esperado de un período que ya estaba facturado parcial', async () => {
    const { useCase, invoices } = build(
      invoice({ amountUf: 50, targetAmountUf: 150 }),
      invoice({ id: 'invoice-2', folio: '95', position: 1, amountUf: 50, targetAmountUf: 150 }),
    );
    await useCase.execute({ invoiceId: 'invoice-2', actor });
    expect(invoices.periodTarget).toEqual({ periodKey: '2026-10', targetAmountUf: 150 });
  });

  it('responde no encontrada si la factura no existe', async () => {
    const { useCase } = build();
    const result = await useCase.execute({ invoiceId: 'nope', actor });
    expect(result.isErr()).toBe(true);
  });
});
