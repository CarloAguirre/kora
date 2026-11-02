import { z } from 'zod';
import { uuidSchema } from '../common/primitives';

/**
 * EDT de referencia calculada por Gemini sobre el documento KDM temporal.
 * No contiene fechas ni asignaciones de personas: la planificación operativa
 * posterior sigue siendo responsabilidad del líder del proyecto.
 */
export const quotationReferenceTaskSchema = z.object({
  wbs: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(3000).default(''),
  role: z.string().trim().min(1).max(120),
  hours: z.number().positive().max(1000000),
});
export const quotationReferenceModuleSchema = z.object({
  name: z.string().trim().min(1).max(300),
  tasks: z.array(quotationReferenceTaskSchema).min(1).max(60),
  totalHours: z.number().positive().max(1000000),
});
export const quotationReferenceEdtSchema = z.object({
  schemaVersion: z.literal('kora.quotation.reference-edt.v1'),
  source: z.literal('kdm_demo'),
  provider: z.literal('gemini'),
  modules: z.array(quotationReferenceModuleSchema).min(1).max(30),
  totalHours: z.number().positive().max(1000000),
});
export type QuotationReferenceEdt = z.infer<typeof quotationReferenceEdtSchema>;

export const applyQuotationPlanningSchema = z.object({
  revision: z.number().int().positive(),
  confirmation: z.literal('APLICAR_PLANIFICACION_KDM_DEMO'),
});
export type ApplyQuotationPlanningInput = z.infer<typeof applyQuotationPlanningSchema>;

export const appliedQuotationPlanningSchema = z.object({
  projectId: uuidSchema,
  versionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
  appliedAt: z.string().datetime(),
  appliedByUserId: uuidSchema.nullable(),
  source: z.literal('kdm_demo'),
  status: z.enum(['accepted_for_planning_only', 'transferred']),
  commercialApproval: z.boolean(),
  totalHours: z.number().positive(),
  modules: z.array(z.object({
    moduleId: uuidSchema,
    name: z.string(),
    totalHours: z.number().positive(),
    tasks: z.array(quotationReferenceTaskSchema),
  })),
});
export type AppliedQuotationPlanning = z.infer<typeof appliedQuotationPlanningSchema>;
