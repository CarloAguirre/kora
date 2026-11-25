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
  /** Orden dentro de las facturas del período (0 = la primera). */
  readonly position: number;
  /** Total esperado del período mientras queda saldo por facturar — `null` si el período queda cerrado. Ver `periodBillingOf`. */
  readonly targetAmountUf: number | null;
  readonly folio: string;
  readonly invoicedAt: Date;
  readonly dueAt: Date | null;
  readonly attachmentName: string | null;
  readonly attachmentContent?: string;
  readonly monthlyPeriodId: string | null;
}

export interface SupportInvoiceRecord {
  readonly id: string;
  readonly planId: string;
  readonly periodKey: string;
  readonly amountUf: number;
  readonly currency: SupportPlanCurrency;
  readonly hoursBilled: number | null;
  readonly position: number;
  readonly targetAmountUf: number | null;
  readonly folio: string;
  readonly invoicedAt: Date;
  readonly dueAt: Date | null;
  readonly paidAt: Date | null;
  readonly attachmentName: string | null;
  readonly hasAttachment?: boolean;
  readonly monthlyPeriodId: string | null;
}

/**
 * Una fila es un hecho consumado: que exista alguna para `(planId, periodKey)`
 * YA significa "facturado" o "facturado parcial" (el total del período puede
 * estar dividido en varias filas, emitidas en distintos momentos). No hay
 * `update` de estado de facturación — solo `createMany` (al facturar),
 * `setPeriodTarget` (el total esperado del período), `markPaid` (al registrar
 * el pago de una factura) y `removeMany` (al anular una factura mal emitida,
 * ver `VoidSupportInvoiceUseCase`). Ver el comentario de la tabla en
 * `packages/db/src/schema/tickets.ts`.
 */
export interface SupportInvoiceRepository {
  /** Agrega un PDF solo si no existe; nunca reemplaza el documento previo. */
  attachDocument(id: string, attachment: { name: string; content: string }): Promise<boolean>;
  getAttachment(id: string): Promise<{ name: string; content: string } | null>;
  findById(id: string, context?: TransactionContext): Promise<SupportInvoiceRecord | null>;
  /** Las facturas de un período, ordenadas por `position` — vacío si el período no se facturó. */
  listByPlanAndPeriod(planId: string, periodKey: string, context?: TransactionContext): Promise<SupportInvoiceRecord[]>;
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

  /** Las facturas en que se dividió el total de un período, en una sola inserción. */
  createMany(inputs: readonly CreateSupportInvoiceInput[], context?: TransactionContext): Promise<void>;
  markPaid(id: string, paidAt: Date, context?: TransactionContext): Promise<void>;
  /** Fija el total esperado en TODAS las facturas del período — `null` lo cierra por la suma de sus facturas. */
  setPeriodTarget(planId: string, periodKey: string, targetAmountUf: number | null, context?: TransactionContext): Promise<void>;
  /** Las horas facturadas de una factura pasan a otra del mismo período — antes de anular la que las tenía. */
  setHoursBilled(id: string, hoursBilled: number | null, context?: TransactionContext): Promise<void>;
  /** Borra las filas — si son todas las del período, vuelve a quedar "por facturar"; los tickets enlazados quedan sin factura (`on delete set null`). */
  removeMany(ids: readonly string[], context?: TransactionContext): Promise<void>;
}

export const SUPPORT_INVOICE_REPOSITORY = Symbol('SupportInvoiceRepository');
