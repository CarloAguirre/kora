import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, sql, supportInvoices, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateSupportInvoiceInput,
  SupportInvoiceRecord,
  SupportInvoiceRepository,
} from '../../domain/repositories/support-invoice.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

interface SupportInvoiceRow {
  id: string;
  planId: string;
  periodKey: string;
  amountUf: string;
  currency: string;
  hoursBilled: string | null;
  folio: string;
  invoicedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
  attachmentName: string | null;
  monthlyPeriodId: string | null;
}

function toRecord(row: SupportInvoiceRow): SupportInvoiceRecord {
  return {
    id: row.id,
    planId: row.planId,
    periodKey: row.periodKey,
    amountUf: Number(row.amountUf),
    currency: row.currency as SupportInvoiceRecord['currency'],
    hoursBilled: row.hoursBilled !== null ? Number(row.hoursBilled) : null,
    folio: row.folio,
    invoicedAt: row.invoicedAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    attachmentName: row.attachmentName,
    monthlyPeriodId: row.monthlyPeriodId,
  };
}

@Injectable()
export class DrizzleSupportInvoiceRepository implements SupportInvoiceRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<SupportInvoiceRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportInvoices).where(eq(supportInvoices.id, id)).limit(1);
    const row = rows[0];
    return row ? toRecord(row as SupportInvoiceRow) : null;
  }

  async findByPlanAndPeriod(planId: string, periodKey: string, context?: TransactionContext): Promise<SupportInvoiceRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select()
      .from(supportInvoices)
      .where(and(eq(supportInvoices.planId, planId), eq(supportInvoices.periodKey, periodKey)))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row as SupportInvoiceRow) : null;
  }

  async listForPlan(planId: string, context?: TransactionContext): Promise<SupportInvoiceRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportInvoices).where(eq(supportInvoices.planId, planId));
    return rows.map((row) => toRecord(row as SupportInvoiceRow));
  }

  async listForPeriod(periodKey: string, context?: TransactionContext): Promise<SupportInvoiceRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportInvoices).where(eq(supportInvoices.periodKey, periodKey));
    return rows.map((row) => toRecord(row as SupportInvoiceRow));
  }

  async listAll(context?: TransactionContext): Promise<SupportInvoiceRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(supportInvoices);
    return rows.map((row) => toRecord(row as SupportInvoiceRow));
  }

  async listOverdue(asOf: Date, context?: TransactionContext): Promise<SupportInvoiceRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select()
      .from(supportInvoices)
      .where(and(isNull(supportInvoices.paidAt), lt(supportInvoices.dueAt, asOf)));
    return rows.map((row) => toRecord(row as SupportInvoiceRow));
  }

  async sumHoursBilledForPlan(planId: string, context?: TransactionContext): Promise<number> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${supportInvoices.hoursBilled}), 0)` })
      .from(supportInvoices)
      .where(eq(supportInvoices.planId, planId));
    return Number(rows[0]?.total ?? 0);
  }

  async create(input: CreateSupportInvoiceInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.insert(supportInvoices).values({
      id: input.id,
      planId: input.planId,
      periodKey: input.periodKey,
      amountUf: String(input.amountUf),
      currency: input.currency,
      hoursBilled: input.hoursBilled !== null ? String(input.hoursBilled) : null,
      folio: input.folio,
      invoicedAt: input.invoicedAt,
      dueAt: input.dueAt,
      attachmentName: input.attachmentName,
      monthlyPeriodId: input.monthlyPeriodId,
    });
  }

  async markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.update(supportInvoices).set({ paidAt, updatedAt: new Date() }).where(eq(supportInvoices.id, id));
  }
}
