import { Inject, Injectable } from '@nestjs/common';
import { and, asc, clients, eq, gt, isNull, lte, projectPaymentMilestones, projects, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  CreateProjectPaymentMilestoneInput,
  IssueProjectPaymentMilestoneInvoiceInput,
  ProjectPaymentMilestoneRecord,
  ProjectPaymentMilestoneRepository,
  ProjectPaymentMilestoneWithContext,
  UpdateProjectPaymentMilestoneInput,
} from '../../domain/repositories/project-payment-milestone.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

const SELECTION = {
  id: projectPaymentMilestones.id,
  projectId: projectPaymentMilestones.projectId,
  name: projectPaymentMilestones.name,
  percent: projectPaymentMilestones.percent,
  amount: projectPaymentMilestones.amount,
  invoiceNumber: projectPaymentMilestones.invoiceNumber,
  issuedAt: projectPaymentMilestones.issuedAt,
  dueAt: projectPaymentMilestones.dueAt,
  status: projectPaymentMilestones.status,
  paidAt: projectPaymentMilestones.paidAt,
  sortOrder: projectPaymentMilestones.sortOrder,
  triggerType: projectPaymentMilestones.triggerType,
  triggerPhase: projectPaymentMilestones.triggerPhase,
  triggerDate: projectPaymentMilestones.triggerDate,
};

type Row = {
  id: string;
  projectId: string;
  name: string;
  percent: string | null;
  amount: string;
  invoiceNumber: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  status: ProjectPaymentMilestoneRecord['status'];
  paidAt: Date | null;
  sortOrder: number;
  triggerType: ProjectPaymentMilestoneRecord['triggerType'];
  triggerPhase: ProjectPaymentMilestoneRecord['triggerPhase'];
  triggerDate: Date | null;
};

function toRecord(row: Row): ProjectPaymentMilestoneRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    percent: row.percent === null ? null : Number(row.percent),
    amount: Number(row.amount),
    invoiceNumber: row.invoiceNumber,
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
    status: row.status,
    paidAt: row.paidAt,
    sortOrder: row.sortOrder,
    triggerType: row.triggerType,
    triggerPhase: row.triggerPhase,
    triggerDate: row.triggerDate,
  };
}

@Injectable()
export class DrizzleProjectPaymentMilestoneRepository implements ProjectPaymentMilestoneRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(
    projectId: string,
    context?: TransactionContext,
  ): Promise<ProjectPaymentMilestoneRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(SELECTION)
      .from(projectPaymentMilestones)
      .where(eq(projectPaymentMilestones.projectId, projectId))
      .orderBy(asc(projectPaymentMilestones.sortOrder));

    return rows.map(toRecord);
  }

  async listAll(context?: TransactionContext): Promise<ProjectPaymentMilestoneWithContext[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({
        ...SELECTION,
        projectName: projects.name,
        clientId: projects.clientId,
        clientName: clients.companyName,
        currency: projects.contractCurrency,
      })
      .from(projectPaymentMilestones)
      .innerJoin(projects, eq(projectPaymentMilestones.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(isNull(projects.deletedAt))
      .orderBy(asc(projectPaymentMilestones.sortOrder));

    return rows.map((row) => ({
      ...toRecord(row),
      projectName: row.projectName,
      clientId: row.clientId,
      clientName: row.clientName,
      currency: row.currency,
    }));
  }

  async listPendingDateTriggered(today: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord[]> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(SELECTION)
      .from(projectPaymentMilestones)
      .innerJoin(projects, eq(projectPaymentMilestones.projectId, projects.id))
      .where(
        and(
          eq(projectPaymentMilestones.status, 'pending'),
          eq(projectPaymentMilestones.triggerType, 'date'),
          lte(projectPaymentMilestones.triggerDate, new Date(today)),
          gt(projectPaymentMilestones.amount, '0'),
          isNull(projects.deletedAt),
        ),
      );

    return rows.map(toRecord);
  }

  async findById(id: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord | null> {
    const db = resolveDb(this.database, context);

    const rows = await db.select(SELECTION).from(projectPaymentMilestones).where(eq(projectPaymentMilestones.id, id)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async create(input: CreateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    const inserted = await db
      .insert(projectPaymentMilestones)
      .values({
        projectId: input.projectId,
        name: input.name,
        percent: input.percent != null ? String(input.percent) : null,
        amount: String(input.amount),
        sortOrder: input.sortOrder,
        triggerType: input.triggerType,
        triggerPhase: input.triggerType === 'phase' ? input.triggerPhase : null,
        triggerDate: input.triggerType === 'date' ? input.triggerDate : null,
      })
      .returning({ id: projectPaymentMilestones.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('El tramo no devolvió identificador.');
    return id;
  }

  async update(id: string, input: UpdateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectPaymentMilestones)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.percent !== undefined ? { percent: input.percent != null ? String(input.percent) : null } : {}),
        ...(input.amount !== undefined ? { amount: String(input.amount) } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.triggerType !== undefined ? { triggerType: input.triggerType } : {}),
        ...(input.triggerPhase !== undefined ? { triggerPhase: input.triggerPhase } : {}),
        ...(input.triggerDate !== undefined ? { triggerDate: input.triggerDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
        ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectPaymentMilestones.id, id));
  }

  async remove(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectPaymentMilestones).where(eq(projectPaymentMilestones.id, id));
  }

  async markToInvoice(id: string, context?: TransactionContext): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const updated = await db
      .update(projectPaymentMilestones)
      .set({ status: 'to_invoice', updatedAt: new Date() })
      .where(and(eq(projectPaymentMilestones.id, id), eq(projectPaymentMilestones.status, 'pending')))
      .returning({ id: projectPaymentMilestones.id });

    return updated.length > 0;
  }

  async markIssued(
    id: string,
    input: IssueProjectPaymentMilestoneInvoiceInput,
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectPaymentMilestones)
      .set({
        status: 'invoiced',
        invoiceNumber: input.invoiceNumber,
        issuedAt: input.issuedAt,
        dueAt: input.dueAt,
        updatedAt: new Date(),
      })
      .where(eq(projectPaymentMilestones.id, id));
  }

  async markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);

    await db
      .update(projectPaymentMilestones)
      .set({ status: 'paid', paidAt, updatedAt: new Date() })
      .where(eq(projectPaymentMilestones.id, id));
  }
}
