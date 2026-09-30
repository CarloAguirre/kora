import type { TransactionContext } from '@kora/core';
import type { ProjectPaymentStatus } from '@kora/contracts';

/** Tramo de pago del proyecto ("Facturación de Proyectos") — cronograma de cobro configurado manualmente por proyecto. */
export interface ProjectPaymentMilestoneRecord {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly percent: number | null;
  readonly amount: number;
  readonly invoiceNumber: string | null;
  readonly issuedAt: Date | null;
  readonly status: ProjectPaymentStatus;
  readonly paidAt: Date | null;
  readonly sortOrder: number;
}

/** `ProjectPaymentMilestoneRecord` con el nombre del proyecto/cliente — para el libro combinado de Facturación (rol Finanzas). */
export interface ProjectPaymentMilestoneWithContext extends ProjectPaymentMilestoneRecord {
  readonly projectName: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
}

export interface CreateProjectPaymentMilestoneInput {
  readonly projectId: string;
  readonly name: string;
  readonly percent: number | null;
  readonly amount: number;
  readonly sortOrder: number;
}

export interface UpdateProjectPaymentMilestoneInput {
  readonly name?: string;
  readonly percent?: number | null;
  readonly amount?: number;
  readonly sortOrder?: number;
  readonly status?: ProjectPaymentStatus;
  readonly invoiceNumber?: string | null;
  readonly issuedAt?: Date | null;
  readonly paidAt?: Date | null;
}

export interface IssueProjectPaymentMilestoneInvoiceInput {
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
}

export interface ProjectPaymentMilestoneRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord[]>;
  /** Todos los tramos de todos los proyectos, con nombre de proyecto/cliente — para el libro combinado de Facturación. */
  listAll(context?: TransactionContext): Promise<ProjectPaymentMilestoneWithContext[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord | null>;

  create(input: CreateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<string>;
  update(id: string, input: UpdateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<void>;

  markIssued(id: string, input: IssueProjectPaymentMilestoneInvoiceInput, context?: TransactionContext): Promise<void>;
  markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void>;
}

export const PROJECT_PAYMENT_MILESTONE_REPOSITORY = Symbol('ProjectPaymentMilestoneRepository');
