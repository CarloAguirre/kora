import { z } from 'zod';

/**
 * Resumen del plan de soporte de un proyecto, para la ficha de detalle.
 * Ver `FichaProyectoSoporte` en la v1 ("Estado del proyecto" + "Historial de
 * progreso"). `null` cuando el proyecto no tiene un plan de soporte activo.
 */

export const SUPPORT_PLAN_TYPES = ['monthly', 'bundle', 'on_demand'] as const;
export const supportPlanTypeSchema = z.enum(SUPPORT_PLAN_TYPES);
export type SupportPlanType = z.infer<typeof supportPlanTypeSchema>;

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
  usedHours: z.number(),
  /** `null` para "a demanda" (sin tope). */
  availableHours: z.number().nullable(),
  /** Solo para planes mensuales con un período activo hoy. */
  currentPeriod: z
    .object({
      usedHours: z.number(),
      capacityHours: z.number(),
      remainingHours: z.number(),
    })
    .nullable(),
  history: z.array(supportPlanHistoryPointSchema),
});
export type SupportProjectSummary = z.infer<typeof supportProjectSummarySchema>;
