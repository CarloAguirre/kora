import { z } from 'zod';
import { arrayQueryParam, nonEmptyTrimmed, pageSchema, paginationQuerySchema, sortDirectionSchema, uuidSchema } from '../common/primitives';
import { supportPlanCurrencySchema, supportPlanDetailSchema, supportPlanScopeSchema, supportPlanTypeSchema } from './support-plan.contract';

/**
 * Una fila de `support_invoices` es un hecho consumado, no un estado: que
 * exista para un `(planId, periodKey)` YA significa "facturado". El estado de
 * pago se deriva al leer (`paidAt` → pagado; `dueAt` vencido → atrasado; si
 * no, pendiente) — nunca se guarda, ver el comentario en
 * `packages/db/src/schema/tickets.ts`. Kora no emite la factura: solo
 * registra que ya se emitió y cuándo se pagó.
 */

export const SUPPORT_INVOICE_BILLING_STATUSES = ['to_invoice', 'invoiced'] as const;
export const supportInvoiceBillingStatusSchema = z.enum(SUPPORT_INVOICE_BILLING_STATUSES);
export type SupportInvoiceBillingStatus = z.infer<typeof supportInvoiceBillingStatusSchema>;

export const SUPPORT_INVOICE_BILLING_STATUS_LABELS: Readonly<Record<SupportInvoiceBillingStatus, string>> = {
  to_invoice: 'Por facturar',
  invoiced: 'Facturado',
};

export const SUPPORT_INVOICE_PAYMENT_STATUSES = ['pending', 'overdue', 'paid'] as const;
export const supportInvoicePaymentStatusSchema = z.enum(SUPPORT_INVOICE_PAYMENT_STATUSES);
export type SupportInvoicePaymentStatus = z.infer<typeof supportInvoicePaymentStatusSchema>;

export const SUPPORT_INVOICE_PAYMENT_STATUS_LABELS: Readonly<Record<SupportInvoicePaymentStatus, string>> = {
  pending: 'Pago pendiente',
  overdue: 'Atrasado',
  paid: 'Pagado',
};

export const supportInvoiceSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  /** 'YYYY-MM'. Para `monthly` coincide con un `support_monthly_periods`; para `bundle`/`on_demand` es el mes calendario en que se emitió. */
  periodKey: z.string(),
  /** Congelado al facturar — no se recalcula después aunque cambien las horas registradas. */
  amountUf: z.number(),
  /** Moneda congelada junto con el monto — la del contrato al momento de facturar. */
  currency: supportPlanCurrencySchema,
  hoursBilled: z.number().nullable(),
  folio: z.string(),
  invoicedAt: z.iso.date(),
  dueAt: z.iso.date().nullable(),
  paidAt: z.iso.date().nullable(),
  attachmentName: z.string().nullable(),
  /** Derivado al leer — ver el comentario del schema de la tabla. */
  paymentStatus: supportInvoicePaymentStatusSchema,
});
export type SupportInvoice = z.infer<typeof supportInvoiceSchema>;

export const markSupportInvoiceIssuedSchema = z.object({
  folio: nonEmptyTrimmed(50, 'El folio'),
  invoicedAt: z.iso.date(),
  attachmentName: z.string().trim().max(255).optional(),
});
export type MarkSupportInvoiceIssuedInput = z.infer<typeof markSupportInvoiceIssuedSchema>;

export const markSupportInvoicePaidSchema = z.object({
  paidAt: z.iso.date(),
});
export type MarkSupportInvoicePaidInput = z.infer<typeof markSupportInvoicePaidSchema>;

/** Ficha de contrato + su historial de facturas — la respuesta de `GET /support-plans/:id`. */
export const supportPlanWithInvoicesSchema = supportPlanDetailSchema.extend({
  invoices: z.array(supportInvoiceSchema),
});
export type SupportPlanWithInvoices = z.infer<typeof supportPlanWithInvoicesSchema>;

/** Fila del panel de Facturación de Soporte — un contrato en el período seleccionado. */
export const supportBillingRowSchema = z.object({
  planId: uuidSchema,
  planName: z.string(),
  clientId: uuidSchema,
  clientName: z.string(),
  scope: supportPlanScopeSchema,
  planType: supportPlanTypeSchema,
  /** `null` = sin movimiento en este período (ni factura registrada ni monto en vivo — solo posible en períodos pasados). */
  amountUf: z.number().nullable(),
  currency: supportPlanCurrencySchema,
  billingStatus: supportInvoiceBillingStatusSchema.nullable(),
  paymentStatus: supportInvoicePaymentStatusSchema.nullable(),
  hasAlert: z.boolean(),
  isOverdue: z.boolean(),
});
export type SupportBillingRow = z.infer<typeof supportBillingRowSchema>;

/**
 * KPIs de un grupo de contratos que comparten moneda — sumar montos de
 * monedas distintas sería inventar un número sin sentido, así que en vez de
 * un total único hay un grupo por cada moneda presente (en la práctica, casi
 * siempre uno solo: "UF").
 */
export const supportBillingKpiGroupSchema = z.object({
  currency: supportPlanCurrencySchema,
  toInvoiceAmount: z.number(),
  toInvoiceCount: z.number().int(),
  invoicedAmount: z.number(),
  paidAmount: z.number(),
  /** Cruza TODOS los períodos, no solo el seleccionado — igual que en el prototipo. */
  overdueAmount: z.number(),
  overdueCount: z.number().int(),
});
export type SupportBillingKpiGroup = z.infer<typeof supportBillingKpiGroupSchema>;

/**
 * KPIs del panel — cruzan TODOS los contratos activos, así que viven en su
 * propio endpoint: la tabla (`GET /support-invoices/overview/rows`) se pagina
 * en el servidor y nunca trae la lista completa.
 */
export const supportBillingOverviewSchema = z.object({
  /** 'YYYY-MM' del período consultado. */
  period: z.string(),
  perCurrency: z.array(supportBillingKpiGroupSchema),
  /** Agnóstico a moneda — cuenta contratos, no montos. */
  alertsCount: z.number().int(),
  /** Clientes con algún contrato activo, ordenados por nombre — opciones del filtro "Cliente" de la tabla. */
  clients: z.array(z.object({ id: uuidSchema, name: z.string() })),
});
export type SupportBillingOverview = z.infer<typeof supportBillingOverviewSchema>;

const periodKeySchema = z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido.');

export const supportBillingOverviewQuerySchema = z.object({
  /** 'YYYY-MM'. */
  period: periodKeySchema,
});
export type SupportBillingOverviewQuery = z.infer<typeof supportBillingOverviewQuerySchema>;

export const supportBillingRowSortFieldSchema = z.enum(['client', 'plan', 'type', 'amount', 'billing', 'payment']);
export type SupportBillingRowSortField = z.infer<typeof supportBillingRowSortFieldSchema>;

export const listSupportBillingRowsQuerySchema = paginationQuerySchema.extend({
  /** 'YYYY-MM'. */
  period: periodKeySchema,
  planType: supportPlanTypeSchema.optional(),
  /** Tab "Con alertas" — no es un tipo de contrato, por eso es un filtro aparte de `planType`. */
  onlyAlerts: z.stringbool().optional(),
  clientId: arrayQueryParam(uuidSchema),
  sortField: supportBillingRowSortFieldSchema.default('client'),
  sortDirection: sortDirectionSchema.default('asc'),
});
export type ListSupportBillingRowsQuery = z.infer<typeof listSupportBillingRowsQuerySchema>;

export const listSupportBillingRowsResponseSchema = pageSchema(supportBillingRowSchema);
export type ListSupportBillingRowsResponse = z.infer<typeof listSupportBillingRowsResponseSchema>;

/**
 * Libro combinado de Facturación (rol Finanzas) — une Soporte y Proyectos en
 * una sola tabla plana. Soporte: el período vigente (mismo cálculo que
 * `supportBillingOverviewSchema`) + el historial real de `support_invoices`
 * (todos los períodos). Proyectos: todos los `project_payment_milestones` de
 * todos los proyectos. Los KPIs se calculan en el cliente a partir de las
 * filas, igual que en el prototipo.
 */
export const BILLING_LEDGER_LINES = ['soporte', 'proyecto'] as const;
export const billingLedgerLineSchema = z.enum(BILLING_LEDGER_LINES);
export type BillingLedgerLine = z.infer<typeof billingLedgerLineSchema>;

export const BILLING_LEDGER_LINE_LABELS: Readonly<Record<BillingLedgerLine, string>> = {
  soporte: 'Soporte',
  proyecto: 'Proyecto',
};

export const BILLING_LEDGER_STATUSES = ['pendiente', 'facturado', 'atrasado', 'pagado'] as const;
export const billingLedgerStatusSchema = z.enum(BILLING_LEDGER_STATUSES);
export type BillingLedgerStatus = z.infer<typeof billingLedgerStatusSchema>;

export const BILLING_LEDGER_STATUS_LABELS: Readonly<Record<BillingLedgerStatus, string>> = {
  pendiente: 'Pendiente',
  facturado: 'Facturado',
  atrasado: 'Atrasado',
  pagado: 'Pagado',
};

export const billingLedgerEntrySchema = z.object({
  /** Id de la fila para la lista (no siempre corresponde a una entidad — la fila "pendiente" de un contrato de soporte vigente no tiene factura todavía). */
  id: z.string(),
  line: billingLedgerLineSchema,
  clientId: uuidSchema,
  clientName: z.string(),
  /** Nombre del contrato de soporte o del tramo del proyecto. */
  detail: z.string(),
  /** Soporte: en la moneda del contrato (ver `currency`). Proyecto: el monto declarado en el tramo, tal como se guardó. */
  amount: z.number(),
  /** Soporte: la moneda real del contrato. Proyecto: `CLP` fijo — `project_payment_milestones` todavía no tiene moneda propia. */
  currency: supportPlanCurrencySchema,
  folio: z.string().nullable(),
  issuedAt: z.iso.date().nullable(),
  status: billingLedgerStatusSchema,
  paidAt: z.iso.date().nullable(),
  /** Id de la factura de soporte o del tramo de proyecto — `null` si todavía no existe (fila "pendiente" de soporte). */
  referenceId: z.string().nullable(),
  /** Solo `line: 'proyecto'` — el proyecto dueño del tramo, para las acciones de la fila. */
  projectId: uuidSchema.nullable(),
  /** Solo `line: 'proyecto'` — nombre del proyecto, sin el del tramo (`detail` los concatena). */
  projectName: z.string().nullable(),
  /** Solo `line: 'proyecto'` — nombre del tramo (ej. "Inicio"). */
  milestoneName: z.string().nullable(),
  /** Solo `line: 'proyecto'` — porcentaje del tramo sobre el total, si se configuró. */
  milestonePercent: z.number().nullable(),
});
export type BillingLedgerEntry = z.infer<typeof billingLedgerEntrySchema>;

export const billingLedgerResponseSchema = z.object({ entries: z.array(billingLedgerEntrySchema) });
export type BillingLedgerResponse = z.infer<typeof billingLedgerResponseSchema>;
