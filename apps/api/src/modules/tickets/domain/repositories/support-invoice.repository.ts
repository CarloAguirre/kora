import type { TransactionContext } from '@kora/core';
import type { SupportPlanCurrency } from '@kora/contracts';

export interface CreateSupportInvoiceInput {
  readonly id: string;
  readonly planId: string;
  /** 'YYYY-MM'. */
  readonly periodKey: string;
  readonly amountUf: number;
  /** Moneda del contrato al momento de facturar — se congela junto con el monto, igual criterio. */
  readonly currency: SupportPlanCurrency;
  readonly hoursBilled: number | null;
  readonly folio: string;
  readonly invoicedAt: Date;
  readonly dueAt: Date | null;
  readonly attachmentName: string | null;
  readonly monthlyPeriodId: string | null;
}

export interface SupportInvoiceRecord {
  readonly id: string;
  readonly planId: string;
  readonly periodKey: string;
  readonly amountUf: number;
  readonly currency: SupportPlanCurrency;
  readonly hoursBilled: number | null;
  readonly folio: string;
  readonly invoicedAt: Date;
  readonly dueAt: Date | null;
  readonly paidAt: Date | null;
  readonly attachmentName: string | null;
  readonly monthlyPeriodId: string | null;
}

/**
 * Una fila es un hecho consumado: que exista para `(planId, periodKey)` YA
 * significa "facturado". No hay `update` de estado de facturación — solo
 * `create` (al facturar) y `markPaid` (al registrar el pago). Ver el
 * comentario de la tabla en `packages/db/src/schema/tickets.ts`.
 */
export interface SupportInvoiceRepository {
  findById(id: string, context?: TransactionContext): Promise<SupportInvoiceRecord | null>;
  findByPlanAndPeriod(planId: string, periodKey: string, context?: TransactionContext): Promise<SupportInvoiceRecord | null>;
  listForPlan(planId: string, context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
  /** `listForPlan` de varios planes en una sola consulta — evita el N+1 del panel de Facturación. */
  listForPlans(planIds: readonly string[], context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
  /** Para el panel de Facturación: todas las facturas emitidas EN el período dado, de cualquier plan. */
  listForPeriod(periodKey: string, context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
  /** Todo el historial, de cualquier plan y período — para el libro combinado de Facturación (rol Finanzas). */
  listAll(context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
  /** Para el KPI "Pagos atrasados", que cruza todos los períodos: toda factura no pagada con `due_at` vencido. */
  listOverdue(asOf: Date, context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
  /** Suma de `hours_billed` de las facturas previas de un plan — para no volver a cobrar el mismo excedente en un contrato `bundle`. */
  sumHoursBilledForPlan(planId: string, context?: TransactionContext): Promise<number>;

  create(input: CreateSupportInvoiceInput, context?: TransactionContext): Promise<void>;
  markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void>;
}

export const SUPPORT_INVOICE_REPOSITORY = Symbol('SupportInvoiceRepository');
