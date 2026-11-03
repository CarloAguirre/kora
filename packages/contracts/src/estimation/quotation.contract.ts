import { z } from 'zod';
import { estimationAnalysisArtifactSchema } from './analysis-artifact.contract';
import { quotationReferenceEdtSchema } from './quotation-reference-edt.contract';
import { estimationPocProposalSchema, submitEstimationAnswerSchema, estimationQuestionSchema } from './estimation.contract';
import { isoDateTimeSchema, nonEmptyTrimmed, uuidSchema } from '../common/primitives';

/**
 * Modelo persistente de cotización. Separado de los estados PoC de IA y de los
 * proyectos en ejecución: ninguna edición de borrador modifica Proyectos.
 */
/**
 * La etapa comercial no equivale al estado operativo. En BD existen proyectos
 * prospect/quoted que ya están active: se permite preparar borradores
 * comerciales INDEPENDIENTES, sin alterar las HH, equipos ni facturación.
 *
 * La creación de versiones también procede en proyectos comerciales
 * aprobados que siguen activos. Reemplazar un roadmap ejecutado requiere un
 * traspaso separado, auditado; crear la versión nunca lo altera.
 * Los estados detenidos/finalizados/cancelados son de consulta.
 */
export interface QuotationEligibilityProject {
  readonly type: 'development' | 'support';
  readonly salesStage: 'prospect' | 'quoted' | 'approved' | null;
  readonly status: 'draft' | 'active' | 'on_hold' | 'finished' | 'cancelled';
}

export function isQuotationDraftEligibleProject(project: QuotationEligibilityProject): boolean {
  return project.type === 'development' &&
    (project.salesStage === 'prospect' || project.salesStage === 'quoted' || project.salesStage === 'approved') &&
    (project.status === 'draft' || project.status === 'active');
}

export const QUOTATION_VERSION_STATUSES = ['draft', 'sent', 'approved'] as const;
export const quotationVersionStatusSchema = z.enum(QUOTATION_VERSION_STATUSES);
export const QUOTATION_VERSION_ORIGINS = ['manual', 'copy', 'ai'] as const;
export const quotationVersionOriginSchema = z.enum(QUOTATION_VERSION_ORIGINS);
export const QUOTATION_CURRENCIES = ['UF', 'CLP', 'USD'] as const;
export const quotationCurrencySchema = z.enum(QUOTATION_CURRENCIES);
export const QUOTATION_TAXES = ['iva19', 'igv18', 'exempt'] as const;
export const quotationTaxSchema = z.enum(QUOTATION_TAXES);

export const quotationTeamDraftSchema = z.object({
  teamId: uuidSchema,
  collaborators: z.number().int().min(1).max(100),
  unit: z.enum(['day', 'week']),
  duration: z.number().min(0).max(520),
  hoursPerWeek: z.number().min(0).max(168),
  dedicationPercent: z.number().min(0).max(100),
});
export const quotationPhaseTeamHoursSchema = z.object({
  teamId: uuidSchema,
  hours: z.number().min(0).max(1000000),
});
export const quotationPhaseDraftSchema = z.object({
  name: nonEmptyTrimmed(300, 'El nombre de fase'),
  startWeek: z.number().int().min(1).max(520),
  durationWeeks: z.number().int().min(1).max(520),
  teamHours: z.array(quotationPhaseTeamHoursSchema).max(100),
});
export const quotationExternalCostSchema = z.object({
  description: nonEmptyTrimmed(500, 'La descripción del costo'),
  amount: z.number().min(0).max(1000000000),
  recurrence: z.enum(['once', 'monthly', 'annual']),
});
export const quotationPaymentItemSchema = z.object({
  name: nonEmptyTrimmed(120, 'El nombre del hito'),
  percent: z.number().min(0).max(100),
  trigger: z.enum(['approval', 'phase', 'date']),
  triggerPhase: z.string().max(100).nullish(),
  triggerDate: z.iso.date().nullish(),
});
/** Evidencia de una propuesta Gemini obtenida desde el documento de demostración KDM.
 * Distinta del artefacto EDT: no simula requerimientos ni entregables inexistentes. */
export const quotationAiPocSnapshotSchema = z.object({
  source: z.literal('kdm_demo'),
  proposal: estimationPocProposalSchema,
  answers: z.array(submitEstimationAnswerSchema),
  dynamicQuestions: z.array(estimationQuestionSchema).max(5).default([]),
  confirmedUnderstanding: z.string().trim().max(4000).nullish(),
  edt: quotationReferenceEdtSchema.nullish(),
  roleTeamIds: z.record(z.string(), uuidSchema).default({}),
});
export type QuotationAiPocSnapshot = z.infer<typeof quotationAiPocSnapshotSchema>;

export const quotationDraftDataSchema = z.object({
  mode: z.enum(['team', 'phases']).default('team'),
  teams: z.array(quotationTeamDraftSchema).max(100).default([]),
  phases: z.array(quotationPhaseDraftSchema).max(100).default([]),
  /**
   * HH manuales por WBS y perfil. La EDT original en aiPoc.edt es inmutable;
   * esta lista representa solo diferencias revisables del borrador.
   */
  edtHourAdjustments: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    role: z.string().trim().min(1).max(120),
    hours: z.number().positive().max(1000000),
  })).max(240).optional(),
  /** Configuración comercial por asignación WBS×perfil, sin modificar Gemini. */
  edtTaskSettings: z.array(z.object({
    wbs: z.string().trim().min(1).max(40),
    role: z.string().trim().min(1).max(120),
    teamId: uuidSchema.optional(),
    fixed: z.boolean().optional(),
  })).max(240).optional(),
  /** Dotación estimada antes de asociar el perfil IA a un equipo Kora. */
  edtRoleCollaborators: z.array(z.object({
    role: z.string().trim().min(1).max(120),
    collaborators: z.number().int().min(1).max(100),
  })).max(100).optional(),
  costs: z.array(quotationExternalCostSchema).max(100).default([]),
  paymentPlan: z.array(quotationPaymentItemSchema).max(100).default([]),
  assumptions: z.array(z.string().trim().max(2000)).max(100).default([]),
  exclusions: z.array(z.string().trim().max(2000)).max(100).default([]),
  sourceRefs: z.array(z.string().trim().max(1000)).max(100).default([]),
  answers: z.record(z.string(), z.unknown()).default({}),
  /** Snapshot de evidencia de IA o simulación. Nunca se descarta al editar HH. */
  analysis: estimationAnalysisArtifactSchema.nullish(),
  aiPoc: quotationAiPocSnapshotSchema.nullish(),
  analysisProjectionStatus: z.enum(['synced', 'modified']).optional(),
}).superRefine((data, ctx) => {
  const teamIds = data.teams.map((team) => team.teamId);
  if (new Set(teamIds).size !== teamIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Los equipos no pueden repetirse.' });
  }
  for (const phase of data.phases) {
    const used = new Set<string>();
    for (const row of phase.teamHours) {
      if (!teamIds.includes(row.teamId) || used.has(row.teamId)) {
        ctx.addIssue({ code: 'custom', message: 'Las HH de fase deben referir a un equipo único y activo.' });
      }
      used.add(row.teamId);
    }
  }
});
export type QuotationDraftData = z.infer<typeof quotationDraftDataSchema>;

export const createQuotationVersionSchema = z.object({
  sourceVersionId: uuidSchema.optional(),
  sourceProjectId: uuidSchema.optional(),
  simulation: z.object({
    analysis: estimationAnalysisArtifactSchema,
    roleTeamIds: z.record(z.string(), uuidSchema),
  }).optional(),
}).refine((value) => !value.sourceVersionId || !value.simulation, {
  message: 'No se puede copiar y simular una versión simultáneamente.',
}).refine((value) => !value.sourceProjectId || Boolean(value.sourceVersionId), {
  message: 'Se requiere una versión de origen al seleccionar otro proyecto.',
});
export type CreateQuotationVersionInput = z.infer<typeof createQuotationVersionSchema>;

export const updateQuotationDraftSchema = z.object({
  revision: z.number().int().min(1),
  name: nonEmptyTrimmed(200, 'El nombre de versión'),
  hourlyRate: z.number().min(0).max(1000000000).nullable(),
  currency: quotationCurrencySchema,
  tax: quotationTaxSchema,
  draft: quotationDraftDataSchema,
});
export type UpdateQuotationDraftInput = z.infer<typeof updateQuotationDraftSchema>;
/** Transiciones comerciales explícitas; ninguna modificación de borrador equivale
 * a aprobación de cliente, ni aceptar IA modifica el proyecto operativo. */
export const quotationRevisionActionSchema = z.object({
  revision: z.number().int().positive(),
});
export type QuotationRevisionActionInput = z.infer<typeof quotationRevisionActionSchema>;

export const approveClientQuotationSchema = quotationRevisionActionSchema.extend({
  confirmation: z.literal('CLIENTE_APROBO_ESTA_VERSION'),
  /** Obligatoria cuando el cliente aprobó un borrador sin envío registrado. */
  confirmWithoutSend: z.literal(true).optional(),
});
export type ApproveClientQuotationInput = z.infer<typeof approveClientQuotationSchema>;

export const transferApprovedQuotationSchema = quotationRevisionActionSchema.extend({
  confirmation: z.literal('TRASPASAR_COTIZACION_APROBADA'),
});
export type TransferApprovedQuotationInput = z.infer<typeof transferApprovedQuotationSchema>;

export const quotationTransferResultSchema = z.object({
  projectId: uuidSchema,
  versionId: uuidSchema,
  transferredAt: isoDateTimeSchema,
  projectHours: z.number().nonnegative(),
  teamCount: z.number().int().nonnegative(),
  moduleCount: z.number().int().nonnegative(),
  paymentMilestoneCount: z.number().int().nonnegative(),
});
export type QuotationTransferResult = z.infer<typeof quotationTransferResultSchema>;


export const quotationVersionSchema = z.object({
  id: uuidSchema,
  quotationId: uuidSchema,
  versionNumber: z.number().int().positive(),
  name: z.string(),
  status: quotationVersionStatusSchema,
  origin: quotationVersionOriginSchema,
  aiReviewStatus: z.enum(['pending', 'accepted']).nullable(),
  revision: z.number().int().positive(),
  createdByUserId: uuidSchema,
  hourlyRate: z.number().nullable(),
  currency: quotationCurrencySchema,
  tax: quotationTaxSchema,
  draft: quotationDraftDataSchema,
  totalHours: z.number().min(0),
  netAmount: z.number().min(0).nullable(),
  totalAmount: z.number().min(0).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type QuotationVersion = z.infer<typeof quotationVersionSchema>;
export const projectQuotationSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  versions: z.array(quotationVersionSchema),
  transferredVersionId: uuidSchema.nullable().optional(),
});
export type ProjectQuotation = z.infer<typeof projectQuotationSchema>;
