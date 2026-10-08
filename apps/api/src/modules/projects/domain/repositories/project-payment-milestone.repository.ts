import type { TransactionContext } from '@kora/core';
import type { ProjectContractCurrency, ProjectPaymentStatus, ProjectPaymentTrigger, ProjectPhase } from '@kora/contracts';

/** Tramo de pago del proyecto ("Facturación de Proyectos") — cronograma de cobro configurado manualmente por proyecto. */
export interface ProjectPaymentMilestoneRecord {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly percent: number | null;
  readonly amount: number;
  readonly invoiceNumber: string | null;
  readonly issuedAt: Date | null;
  readonly dueAt: Date | null;
  readonly status: ProjectPaymentStatus;
  readonly paidAt: Date | null;
  readonly sortOrder: number;
  readonly triggerType: ProjectPaymentTrigger;
  readonly triggerPhase: ProjectPhase | null;
  readonly triggerDate: Date | null;
}

/** `ProjectPaymentMilestoneRecord` con el nombre del proyecto/cliente — para el libro combinado de Facturación (rol Finanzas). */
export interface ProjectPaymentMilestoneWithContext extends ProjectPaymentMilestoneRecord {
  readonly projectName: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly currency: ProjectContractCurrency;
}

/** Cronograma de un tramo: qué se cobra y qué hito lo deja por facturar. */
export interface ProjectPaymentMilestoneSchedule {
  readonly name: string;
  readonly percent: number | null;
  readonly amount: number;
  readonly sortOrder: number;
  readonly triggerType: ProjectPaymentTrigger;
  readonly triggerPhase: ProjectPhase | null;
  readonly triggerDate: Date | null;
}

export interface CreateProjectPaymentMilestoneInput extends ProjectPaymentMilestoneSchedule {
  readonly projectId: string;
}

export interface UpdateProjectPaymentMilestoneInput extends Partial<ProjectPaymentMilestoneSchedule> {
  readonly status?: ProjectPaymentStatus;
  readonly invoiceNumber?: string | null;
  readonly issuedAt?: Date | null;
  readonly dueAt?: Date | null;
  readonly paidAt?: Date | null;
}

export interface IssueProjectPaymentMilestoneInvoiceInput {
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
  readonly dueAt: Date;
}

export interface ProjectPaymentMilestoneRepository {
  listForProject(projectId: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord[]>;
  /** Todos los tramos de proyectos no eliminados, con nombre de proyecto/cliente y moneda — para el libro combinado de Facturación. */
  listAll(context?: TransactionContext): Promise<ProjectPaymentMilestoneWithContext[]>;
  /** Tramos `pending` con monto, por fecha, cuya fecha ya llegó (`today` = `YYYY-MM-DD`) — ver `PaymentMilestoneTriggerService`. */
  listPendingDateTriggered(today: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord[]>;
  findById(id: string, context?: TransactionContext): Promise<ProjectPaymentMilestoneRecord | null>;

  create(input: CreateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<string>;
  update(id: string, input: UpdateProjectPaymentMilestoneInput, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<void>;

  /** `pending` → `to_invoice` solo si sigue `pending`; `false` si otro proceso ya lo cambió. */
  markToInvoice(id: string, context?: TransactionContext): Promise<boolean>;
  markIssued(id: string, input: IssueProjectPaymentMilestoneInvoiceInput, context?: TransactionContext): Promise<void>;
  markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void>;
}

export const PROJECT_PAYMENT_MILESTONE_REPOSITORY = Symbol('ProjectPaymentMilestoneRepository');
