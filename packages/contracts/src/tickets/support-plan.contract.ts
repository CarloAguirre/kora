import { z } from 'zod';
import { isoDateTimeSchema, nonEmptyTrimmed, uuidSchema } from '../common/primitives';
import { projectStatusSchema } from '../projects/project.contract';

/**
 * Resumen del plan de soporte de un proyecto, para la ficha de detalle.
 * Ver `FichaProyectoSoporte` en la v1 ("Estado del proyecto" + "Historial de
 * progreso"). `null` cuando el proyecto no tiene un plan de soporte activo.
 */

export const SUPPORT_PLAN_TYPES = ['monthly', 'bundle', 'on_demand'] as const;
export const supportPlanTypeSchema = z.enum(SUPPORT_PLAN_TYPES);
export type SupportPlanType = z.infer<typeof supportPlanTypeSchema>;

/** Antes cada pantalla repetía esta etiqueta a mano (ver p. ej. `PLAN_TYPE_LABEL` en `ClientPortalPage.tsx`). */
export const SUPPORT_PLAN_TYPE_LABELS: Readonly<Record<SupportPlanType, string>> = {
  monthly: 'Mensual',
  bundle: 'Bolsa',
  on_demand: 'A demanda',
};

export const SUPPORT_SURPLUS_POLICIES = ['accumulate', 'expire'] as const;
export const supportSurplusPolicySchema = z.enum(SUPPORT_SURPLUS_POLICIES);
export type SupportSurplusPolicy = z.infer<typeof supportSurplusPolicySchema>;

export const SUPPORT_SURPLUS_POLICY_LABELS: Readonly<Record<SupportSurplusPolicy, string>> = {
  accumulate: 'Acumulable',
  expire: 'Vencimiento',
};

export const SUPPORT_PLAN_STATUSES = ['active', 'ended', 'cancelled'] as const;
export const supportPlanStatusSchema = z.enum(SUPPORT_PLAN_STATUSES);
export type SupportPlanStatus = z.infer<typeof supportPlanStatusSchema>;

export const SUPPORT_PLAN_STATUS_LABELS: Readonly<Record<SupportPlanStatus, string>> = {
  active: 'Vigente',
  ended: 'Cerrado',
  cancelled: 'Cancelado',
};

/**
 * `single` = el contrato cubre un solo proyecto de desarrollo terminado.
 * `consolidated` = cubre varios, compartiendo una sola bolsa de horas y una
 * sola facturación mensual — ver `support_plan_projects` en el schema.
 */
export const SUPPORT_PLAN_SCOPES = ['single', 'consolidated'] as const;
export const supportPlanScopeSchema = z.enum(SUPPORT_PLAN_SCOPES);
export type SupportPlanScope = z.infer<typeof supportPlanScopeSchema>;

export const SUPPORT_PLAN_SCOPE_LABELS: Readonly<Record<SupportPlanScope, string>> = {
  single: 'Único',
  consolidated: 'Consolidado',
};

/**
 * Moneda del contrato — gobierna `planValueUf`/`extraHourValueUf` pese al
 * nombre heredado de esos campos (existían antes de que hubiera otra moneda
 * que UF). Un contrato tiene una sola moneda para ambos valores. Sin
 * conversión entre monedas: no existe ninguna fuente de tipo de cambio en el
 * sistema, cada contrato se queda en la suya.
 */
export const SUPPORT_PLAN_CURRENCIES = ['UF', 'CLP', 'USD'] as const;
export const supportPlanCurrencySchema = z.enum(SUPPORT_PLAN_CURRENCIES);
export type SupportPlanCurrency = z.infer<typeof supportPlanCurrencySchema>;

export const SUPPORT_PLAN_CURRENCY_LABELS: Readonly<Record<SupportPlanCurrency, string>> = {
  UF: 'UF',
  CLP: 'CLP',
  USD: 'USD',
};

export const supportPlanHistoryPointSchema = z.object({
  label: z.string(),
  /** Solo para planes mensuales — `null` en bolsa/a demanda, donde el gráfico no distingue estos componentes. */
  contractedHours: z.number().nullable(),
  priorSurplusHours: z.number().nullable(),
  usedHours: z.number(),
});
export type SupportPlanHistoryPoint = z.infer<typeof supportPlanHistoryPointSchema>;

export const supportProjectSummarySchema = z.object({
  planType: supportPlanTypeSchema,
  contractedHours: z.number(),
  /** Valor del plan y de la hora extra — v1: `valor_plan_uf`/`valor_hh_extra_uf` de `soporte_plan_contrato`. En la moneda de `currency`, pese al sufijo heredado. */
  planValueUf: z.number(),
  extraHourValueUf: z.number(),
  currency: supportPlanCurrencySchema,
  usedHours: z.number(),
  /** `null` para "a demanda" (sin tope). */
  availableHours: z.number().nullable(),
  /** Solo para planes mensuales con un período activo hoy. */
  currentPeriod: z
    .object({
      usedHours: z.number(),
      /** `planHours + priorSurplusHours`. */
      capacityHours: z.number(),
      remainingHours: z.number(),
      /** HH que el plan entrega este mes (`support_monthly_periods.contracted_hours`). */
      planHours: z.number(),
      /** Saldo acumulado de meses anteriores (solo política acumulable; 0 si vence). */
      priorSurplusHours: z.number(),
    })
    .nullable(),
  history: z.array(supportPlanHistoryPointSchema),
});
export type SupportProjectSummary = z.infer<typeof supportProjectSummarySchema>;

/**
 * Las 3 alertas de negocio del contrato — no existían en ningún lado antes de
 * esto (v1 tampoco las tenía como dato persistente, solo la app las mostraba
 * calculadas). `daysUntilExpiry` solo aplica a `quota_expiring`.
 */
export const SUPPORT_PLAN_ALERT_TYPES = ['deviated_hours', 'quota_expiring', 'last_period_overage'] as const;
export const supportPlanAlertTypeSchema = z.enum(SUPPORT_PLAN_ALERT_TYPES);
export type SupportPlanAlertType = z.infer<typeof supportPlanAlertTypeSchema>;

export const SUPPORT_PLAN_ALERT_LABELS: Readonly<Record<SupportPlanAlertType, string>> = {
  deviated_hours: 'Horas desviadas sin facturar',
  quota_expiring: 'Cupo acumulado por vencer',
  last_period_overage: 'Último mes con excedente de horas',
};

export const supportPlanAlertSchema = z.object({
  type: supportPlanAlertTypeSchema,
  daysUntilExpiry: z.number().int().nullable(),
});
export type SupportPlanAlert = z.infer<typeof supportPlanAlertSchema>;

export const supportPlanLinkedProjectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: projectStatusSchema,
});
export type SupportPlanLinkedProject = z.infer<typeof supportPlanLinkedProjectSchema>;

/** Fila de la tabla "Contratos" en la ficha de cliente. */
export const supportPlanListItemSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  /** Proyecto "contenedor" de soporte del contrato — `null` en contratos legados sin contenedor. */
  projectId: uuidSchema.nullable(),
  name: z.string(),
  scope: supportPlanScopeSchema,
  planType: supportPlanTypeSchema,
  surplusPolicy: supportSurplusPolicySchema.nullable(),
  status: supportPlanStatusSchema,
  leaderName: z.string().nullable(),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  dueDayOfMonth: z.number().int().nullable(),
  contractedHours: z.number(),
  usedHours: z.number(),
  planValueUf: z.number(),
  currency: supportPlanCurrencySchema,
  /** Estado de facturación del período EN CURSO — no de todo el historial. `null` si el monto a facturar hoy es 0. */
  currentBillingStatus: z.enum(['to_invoice', 'invoiced']).nullable(),
  currentAmountUf: z.number(),
  alerts: z.array(supportPlanAlertSchema),
});
export type SupportPlanListItem = z.infer<typeof supportPlanListItemSchema>;

/** Ficha completa del contrato. */
export const supportPlanDetailSchema = supportPlanListItemSchema.extend({
  clientId: uuidSchema,
  clientName: z.string(),
  extraHourValueUf: z.number(),
  leaderUserId: uuidSchema.nullable(),
  contact: z
    .object({
      name: z.string(),
      position: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      /** `false` = viene del override propio del contrato; `true` = es el contacto por defecto del cliente. */
      isClientDefault: z.boolean(),
    })
    .nullable(),
  quotationLink: z.string().nullable(),
  contractLink: z.string().nullable(),
  additionalLinks: z.string().nullable(),
  targetHours: z.object({
    critical: z.number().nullable(),
    high: z.number().nullable(),
    medium: z.number().nullable(),
    low: z.number().nullable(),
  }),
  linkedProjects: z.array(supportPlanLinkedProjectSchema),
  closedAt: z.iso.date().nullable(),
  closeReason: z.string().nullable(),
  summary: supportProjectSummarySchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SupportPlanDetail = z.infer<typeof supportPlanDetailSchema>;

export const createSupportPlanSchema = z.object({
  clientId: uuidSchema,
  /** Proyectos de desarrollo terminados que este contrato cubre — 1 para `scope='single'`, 2+ para `'consolidated'` (el `scope` se deriva de la cantidad, no se elige aparte). */
  developmentProjectIds: z.array(uuidSchema).min(1, 'Selecciona al menos un proyecto.'),
  name: z.string().trim().max(200).optional(),
  leaderUserId: uuidSchema.nullish(),
  /** `null`/omitido = usar el contacto por defecto del cliente. */
  primaryContactId: uuidSchema.nullish(),
  quotationLink: z.string().trim().max(500).optional(),
  contractLink: z.string().trim().max(500).optional(),
  additionalLinks: z.string().trim().max(500).optional(),
  targetHoursCritical: z.coerce.number().min(0).nullish(),
  targetHoursHigh: z.coerce.number().min(0).nullish(),
  targetHoursMedium: z.coerce.number().min(0).nullish(),
  targetHoursLow: z.coerce.number().min(0).nullish(),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullish(),
  planType: supportPlanTypeSchema,
  surplusPolicy: supportSurplusPolicySchema.nullish(),
  contractedHours: z.coerce.number().min(0).default(0),
  planValueUf: z.coerce.number().min(0).default(0),
  extraHourValueUf: z.coerce.number().min(0).default(0),
  currency: supportPlanCurrencySchema.default('UF'),
  /** Solo relevante si `planType='monthly'` y `surplusPolicy='expire'`; si se omite se autosugiere del día de `startDate`. */
  dueDayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
});
export type CreateSupportPlanInput = z.infer<typeof createSupportPlanSchema>;

/** A diferencia de crear, editar acepta `developmentProjectIds: []`: el contrato deja de cubrir proyectos terminados y queda solo con su contenedor de soporte. */
export const updateSupportPlanSchema = createSupportPlanSchema
  .partial()
  .omit({ clientId: true })
  .extend({ developmentProjectIds: z.array(uuidSchema).optional() });
export type UpdateSupportPlanInput = z.infer<typeof updateSupportPlanSchema>;

export const closeSupportPlanSchema = z.object({
  closedAt: z.iso.date(),
  closeReason: nonEmptyTrimmed(200, 'El motivo'),
});
export type CloseSupportPlanInput = z.infer<typeof closeSupportPlanSchema>;
