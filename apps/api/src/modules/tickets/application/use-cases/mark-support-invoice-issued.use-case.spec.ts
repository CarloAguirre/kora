import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator, UnitOfWork } from '@kora/core';
import type { MarkSupportInvoiceIssuedInput } from '@kora/contracts';
import type { AuditEntry, AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type {
  CreateSupportInvoiceInput,
  SupportInvoiceRecord,
  SupportInvoiceRepository,
} from '../../domain/repositories/support-invoice.repository';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import type { SupportBillingCalculation, SupportBillingCalculator } from '../services/support-billing-calculator';
import type { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import { MarkSupportInvoiceIssuedUseCase } from './mark-support-invoice-issued.use-case';

class FakeInvoices implements Pick<SupportInvoiceRepository, 'listByPlanAndPeriod' | 'createMany'> {
  created: CreateSupportInvoiceInput[] = [];
  constructor(private readonly existing: SupportInvoiceRecord[] = []) {}
  async listByPlanAndPeriod(): Promise<SupportInvoiceRecord[]> {
    return this.existing;
  }
  async createMany(inputs: readonly CreateSupportInvoiceInput[]): Promise<void> {
    this.created.push(...inputs);
  }
}

class FakeTickets implements Pick<TicketRepository, 'findClosedUnbilledIds' | 'findUnbilledIdsWithHoursBefore' | 'linkToInvoice'> {
  linked: { ticketIds: readonly string[]; invoiceId: string } | null = null;
  hoursBefore: Date | null = null;
  async findClosedUnbilledIds(): Promise<string[]> {
    return ['ticket-1'];
  }
  async findUnbilledIdsWithHoursBefore(_projectIds: readonly string[], before: Date): Promise<string[]> {
    this.hoursBefore = before;
    return ['ticket-2'];
  }
  async linkToInvoice(ticketIds: readonly string[], invoiceId: string): Promise<void> {
    this.linked = { ticketIds, invoiceId };
  }
}

class FakeAudit implements AuditRecorder {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

const actor = { userId: 'user-1', email: 'finanzas@kabeli.cl' };
const CALCULATION: SupportBillingCalculation = { amountUf: 134.81, hoursBilled: 4, periodKey: '2026-10', monthlyPeriodId: 'period-oct' };

function build(options: { planType?: SupportPlanRecord['planType']; existing?: SupportInvoiceRecord[] } = {}) {
  const record = { id: 'plan-1', planType: options.planType ?? 'monthly', currency: 'UF' } as SupportPlanRecord;
  const invoices = new FakeInvoices(options.existing);
  const tickets = new FakeTickets();
  const audit = new FakeAudit();
  let nextId = 0;
  const useCase = new MarkSupportInvoiceIssuedUseCase(
    {
      findById: async () => ({ toSnapshot: () => record }),
      listPeriodsForPlan: async () => [{ id: 'period-oct', endDate: new Date('2026-11-01T00:00:00Z') }],
    } as unknown as SupportPlanRepository,
    invoices as unknown as SupportInvoiceRepository,
    tickets as unknown as TicketRepository,
    { calculate: async () => CALCULATION } as unknown as SupportBillingCalculator,
    { resolveLinkedProjectIds: async () => ['project-1'] } as unknown as SupportPlanSummaryBuilder,
    audit,
    { run: async (work: (tx: unknown) => Promise<unknown>) => work({}) } as unknown as UnitOfWork,
    { now: () => new Date('2026-10-29T12:00:00Z') } as Clock,
    { generate: () => `invoice-${++nextId}` } as IdGenerator,
  );
  return { useCase, invoices, tickets, audit };
}

const doc = (folio: string, amountUf: number, invoicedAt = '2026-10-29') => ({ folio, amountUf, invoicedAt });
const input = (invoices: MarkSupportInvoiceIssuedInput['invoices']): MarkSupportInvoiceIssuedInput => ({ invoices });

describe('MarkSupportInvoiceIssuedUseCase', () => {
  it('guarda el contenido de cada PDF junto a su factura, sin confiar en el nombre enviado en metadata', async () => {
    const { useCase, invoices } = build();
    const result = await useCase.execute({
      planId: 'plan-1',
      data: input([doc('1', 100), doc('2', 34.81)]),
      attachments: new Map([[1, { name: 'factura-2.pdf', content: 'JVBERi0xLjQ=' }]]),
      actor,
    });
    expect(result.isOk()).toBe(true);
    expect(invoices.created[0]).toMatchObject({ attachmentName: null, attachmentContent: undefined });
    expect(invoices.created[1]).toMatchObject({ attachmentName: 'factura-2.pdf', attachmentContent: 'JVBERi0xLjQ=' });
  });

  it('registra una sola factura por el total', async () => {
    const { useCase, invoices } = build();
    const result = await useCase.execute({ planId: 'plan-1', data: input([doc('27846', 134.81)]), actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.created).toMatchObject([{ folio: '27846', amountUf: 134.81, hoursBilled: 4, position: 0, periodKey: '2026-10' }]);
  });

  it('divide el total en varias facturas, cada una con su vencimiento, y deja las horas solo en la primera', async () => {
    const { useCase, invoices, audit } = build();
    const result = await useCase.execute({
      planId: 'plan-1',
      data: input([doc('27846', 100, '2026-10-29'), doc('27847', 34.81, '2026-10-30')]),
      actor,
    });
    expect(result.isOk()).toBe(true);
    expect(invoices.created).toMatchObject([
      { folio: '27846', amountUf: 100, hoursBilled: 4, position: 0, monthlyPeriodId: 'period-oct', dueAt: new Date('2026-11-28T00:00:00Z') },
      { folio: '27847', amountUf: 34.81, hoursBilled: null, position: 1, monthlyPeriodId: 'period-oct', dueAt: new Date('2026-11-29T00:00:00Z') },
    ]);
    expect(audit.entries).toHaveLength(2);
  });

  it('registra lo facturado aunque no sume el monto calculado (cuota fija sin cobrar el excedente)', async () => {
    const { useCase, invoices, audit } = build();
    const result = await useCase.execute({ planId: 'plan-1', data: input([doc('1527', 7.5), doc('1528', 7.5), doc('1529', 22.5)]), actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.created.map((row) => row.amountUf)).toEqual([7.5, 7.5, 22.5]);
    // Las horas calculadas quedan como facturadas: el excedente no cobrado no se arrastra al mes siguiente.
    expect(invoices.created[0]).toMatchObject({ hoursBilled: 4 });
    expect(audit.entries[0]!.metadata).toMatchObject({ calculatedAmountUf: 134.81 });
  });

  it('acepta montos que suman el total aunque la suma en coma flotante no sea exacta', async () => {
    const { useCase, invoices } = build();
    const result = await useCase.execute({ planId: 'plan-1', data: input([doc('1', 44.27), doc('2', 44.27), doc('3', 46.27)]), actor });
    expect(result.isOk()).toBe(true);
    expect(invoices.created.map((row) => row.amountUf)).toEqual([44.27, 44.27, 46.27]);
  });

  it('no registra si el período ya tiene facturas', async () => {
    const { useCase, invoices } = build({ existing: [{ id: 'old' } as SupportInvoiceRecord] });
    const result = await useCase.execute({ planId: 'plan-1', data: input([doc('27846', 134.81)]), actor });
    expect(result.isErr()).toBe(true);
    expect(invoices.created).toEqual([]);
  });

  it('en un contrato a demanda enlaza los tickets a la primera factura', async () => {
    const { useCase, tickets } = build({ planType: 'on_demand' });
    await useCase.execute({ planId: 'plan-1', data: input([doc('27846', 100), doc('27847', 34.81)]), actor });
    expect(tickets.linked).toEqual({ ticketIds: ['ticket-1'], invoiceId: 'invoice-1' });
  });

  it('en un contrato mensual enlaza los tickets con horas hasta el fin del período facturado', async () => {
    const { useCase, tickets } = build({ planType: 'monthly' });
    await useCase.execute({ planId: 'plan-1', data: input([doc('27846', 134.81)]), actor });
    expect(tickets.hoursBefore).toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(tickets.linked).toEqual({ ticketIds: ['ticket-2'], invoiceId: 'invoice-1' });
  });
});
