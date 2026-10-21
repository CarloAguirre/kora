import { z } from 'zod';
import { isoDateTimeSchema, nonEmptyTrimmed, uuidSchema } from '../common/primitives';

/**
 * Contratos compartidos del módulo de Estimación Inteligente.
 *
 * La IA interpreta y propone; estos contratos describen la forma de los datos
 * que cruzan la frontera HTTP. Los cálculos finales de HH/costo/calendario se
 * ejecutan de forma determinística fuera del LLM.
 */

export const ESTIMATION_STATUSES = [
  'draft',
  'analyzing_sources',
  'awaiting_answers',
  'ready_to_estimate',
  'estimating',
  'completed',
  'failed',
] as const;
export const estimationStatusSchema = z.enum(ESTIMATION_STATUSES);
export type EstimationStatus = z.infer<typeof estimationStatusSchema>;

export const ESTIMATION_REQUIREMENT_TYPES = ['functional', 'non_functional', 'business_rule'] as const;
export const estimationRequirementTypeSchema = z.enum(ESTIMATION_REQUIREMENT_TYPES);
export type EstimationRequirementType = z.infer<typeof estimationRequirementTypeSchema>;

export const ESTIMATION_SCOPE_STATUSES = ['in_scope', 'optional', 'out_of_scope', 'pending'] as const;
export const estimationScopeStatusSchema = z.enum(ESTIMATION_SCOPE_STATUSES);
export type EstimationScopeStatus = z.infer<typeof estimationScopeStatusSchema>;

export const ESTIMATION_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const estimationConfidenceLevelSchema = z.enum(ESTIMATION_CONFIDENCE_LEVELS);
export type EstimationConfidenceLevel = z.infer<typeof estimationConfidenceLevelSchema>;

export const ESTIMATION_IMPACTS = ['high', 'medium', 'low'] as const;
export const estimationImpactSchema = z.enum(ESTIMATION_IMPACTS);
export type EstimationImpact = z.infer<typeof estimationImpactSchema>;

export const ESTIMATION_QUESTION_KINDS = ['fixed', 'dynamic'] as const;
export const estimationQuestionKindSchema = z.enum(ESTIMATION_QUESTION_KINDS);
export type EstimationQuestionKind = z.infer<typeof estimationQuestionKindSchema>;

export const ESTIMATION_ANSWER_TYPES = [
  'single_choice',
  'multi_choice',
  'date',
  'number',
  'text',
  'confirmation',
] as const;
export const estimationAnswerTypeSchema = z.enum(ESTIMATION_ANSWER_TYPES);
export type EstimationAnswerType = z.infer<typeof estimationAnswerTypeSchema>;

export const ESTIMATION_GAP_ACTIONS = ['ask', 'confirm', 'assume', 'ignore'] as const;
export const estimationGapActionSchema = z.enum(ESTIMATION_GAP_ACTIONS);
export type EstimationGapAction = z.infer<typeof estimationGapActionSchema>;

export const estimationSourceReferenceSchema = z.object({
  sourceId: z.string().trim().min(1),
  fileName: nonEmptyTrimmed(500, 'El nombre de la fuente'),
  driveFileId: z.string().trim().min(1).nullish(),
  section: z.string().trim().max(500).nullish(),
  page: z.number().int().positive().nullish(),
  excerpt: z.string().trim().max(1000).nullish(),
});
export type EstimationSourceReference = z.infer<typeof estimationSourceReferenceSchema>;

export const estimationRequirementSchema = z.object({
  id: z.string().trim().min(1),
  type: estimationRequirementTypeSchema,
  module: z.string().trim().max(300).nullish(),
  title: nonEmptyTrimmed(300, 'El título del requerimiento'),
  description: nonEmptyTrimmed(5000, 'La descripción del requerimiento'),
  priority: z.enum(['high', 'medium', 'low']).nullish(),
  scope: estimationScopeStatusSchema.default('pending'),
  confidence: estimationConfidenceLevelSchema,
  sourceRefs: z.array(estimationSourceReferenceSchema).min(1),
});
export type EstimationRequirement = z.infer<typeof estimationRequirementSchema>;

export const estimationUserStorySchema = z.object({
  id: z.string().trim().min(1),
  module: z.string().trim().max(300).nullish(),
  actor: nonEmptyTrimmed(200, 'El actor'),
  need: nonEmptyTrimmed(1500, 'La necesidad'),
  goal: nonEmptyTrimmed(1500, 'El objetivo'),
  acceptanceCriteria: z.array(nonEmptyTrimmed(1200, 'El criterio de aceptación')).default([]),
  relatedRequirementIds: z.array(z.string().trim().min(1)).default([]),
  sourceRefs: z.array(estimationSourceReferenceSchema).default([]),
  requiresDetailedUseCase: z.boolean().default(false),
});
export type EstimationUserStory = z.infer<typeof estimationUserStorySchema>;

export const estimationIntegrationSchema = z.object({
  name: nonEmptyTrimmed(200, 'El nombre de la integración'),
  purpose: z.string().trim().max(1500).nullish(),
  direction: z.enum(['read', 'write', 'bidirectional', 'unknown']).default('unknown'),
  mechanism: z.string().trim().max(300).nullish(),
  apiAvailable: z.boolean().nullish(),
  documentationAvailable: z.boolean().nullish(),
  confidence: estimationConfidenceLevelSchema,
  sourceRefs: z.array(estimationSourceReferenceSchema).default([]),
});
export type EstimationIntegration = z.infer<typeof estimationIntegrationSchema>;

export const estimationTechnicalContextSchema = z.object({
  solutionMode: z.enum(['greenfield', 'evolution', 'unknown']).default('unknown'),
  existingPlatform: z.string().trim().max(500).nullish(),
  frontend: z.string().trim().max(500).nullish(),
  backend: z.string().trim().max(500).nullish(),
  database: z.string().trim().max(500).nullish(),
  cloud: z.string().trim().max(500).nullish(),
  authentication: z.string().trim().max(500).nullish(),
  environments: z.array(z.string().trim().min(1).max(100)).default([]),
  offlineRequired: z.boolean().nullish(),
  migrationRequired: z.boolean().nullish(),
  integrations: z.array(estimationIntegrationSchema).default([]),
  constraints: z.array(z.string().trim().min(1).max(1500)).default([]),
});
export type EstimationTechnicalContext = z.infer<typeof estimationTechnicalContextSchema>;

export const estimationGapSchema = z.object({
  id: z.string().trim().min(1),
  category: nonEmptyTrimmed(120, 'La categoría'),
  finding: nonEmptyTrimmed(2000, 'El hallazgo'),
  impact: estimationImpactSchema,
  action: estimationGapActionSchema,
  reason: z.string().trim().max(2000).nullish(),
  sourceRefs: z.array(estimationSourceReferenceSchema).default([]),
});
export type EstimationGap = z.infer<typeof estimationGapSchema>;

export const projectEstimationContextSchema = z.object({
  projectId: uuidSchema,
  summary: nonEmptyTrimmed(5000, 'El resumen del proyecto'),
  requirements: z.array(estimationRequirementSchema).default([]),
  userStories: z.array(estimationUserStorySchema).default([]),
  technicalContext: estimationTechnicalContextSchema,
  gaps: z.array(estimationGapSchema).default([]),
  assumptions: z.array(z.string().trim().min(1).max(2000)).default([]),
  generatedAt: isoDateTimeSchema,
});
export type ProjectEstimationContext = z.infer<typeof projectEstimationContextSchema>;

export const estimationQuestionOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(300),
});
export type EstimationQuestionOption = z.infer<typeof estimationQuestionOptionSchema>;

export const estimationQuestionSchema = z.object({
  id: z.string().trim().min(1),
  kind: estimationQuestionKindSchema,
  category: nonEmptyTrimmed(120, 'La categoría'),
  question: nonEmptyTrimmed(1500, 'La pregunta'),
  reason: z.string().trim().max(1500).nullish(),
  impact: estimationImpactSchema,
  answerType: estimationAnswerTypeSchema,
  options: z.array(estimationQuestionOptionSchema).max(10).default([]),
  required: z.boolean().default(false),
  canPrefill: z.boolean().default(false),
  detectedValue: z.unknown().optional(),
  confidence: estimationConfidenceLevelSchema.nullish(),
  assumptionIfSkipped: z.string().trim().max(1500).nullish(),
  priorityScore: z.number().int().default(0),
  sourceRefs: z.array(estimationSourceReferenceSchema).default([]),
  dependsOn: z.array(z.string().trim().min(1)).default([]),
});
export type EstimationQuestion = z.infer<typeof estimationQuestionSchema>;

export const estimationQuestionnaireDefinitionSchema = z.object({
  fixedQuestions: z.array(estimationQuestionSchema),
  maxDynamicFirstRound: z.number().int().min(0).max(10),
  maxDynamicFollowUp: z.number().int().min(0).max(5),
  targetMinutesMin: z.number().int().positive(),
  targetMinutesMax: z.number().int().positive(),
});
export type EstimationQuestionnaireDefinition = z.infer<typeof estimationQuestionnaireDefinitionSchema>;

export const estimationAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type EstimationAnswerValue = z.infer<typeof estimationAnswerValueSchema>;

export const submitEstimationAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  value: estimationAnswerValueSchema,
  usedAssumption: z.boolean().default(false),
});
export type SubmitEstimationAnswerInput = z.infer<typeof submitEstimationAnswerSchema>;

export const estimationRoleEffortSchema = z.object({
  role: nonEmptyTrimmed(120, 'El rol'),
  hours: z.number().min(0),
});
export type EstimationRoleEffort = z.infer<typeof estimationRoleEffortSchema>;

export const estimationWbsItemSchema = z.object({
  wbs: nonEmptyTrimmed(50, 'El WBS'),
  phase: nonEmptyTrimmed(200, 'La fase'),
  module: nonEmptyTrimmed(300, 'El módulo'),
  submodule: z.string().trim().max(300).nullish(),
  activity: nonEmptyTrimmed(1500, 'La actividad'),
  workType: z.string().trim().max(200).nullish(),
  complexity: z.enum(['low', 'medium', 'high']),
  scope: estimationScopeStatusSchema,
  referenceIds: z.array(z.string().trim().min(1)).default([]),
  dependencies: z.array(z.string().trim().min(1)).default([]),
  roleEffort: z.array(estimationRoleEffortSchema).min(1),
  totalHours: z.number().min(0),
  notes: z.string().trim().max(3000).nullish(),
});
export type EstimationWbsItem = z.infer<typeof estimationWbsItemSchema>;

export const estimationModuleSummarySchema = z.object({
  module: nonEmptyTrimmed(300, 'El módulo'),
  hours: z.number().min(0),
  percent: z.number().min(0).max(100),
  activityCount: z.number().int().min(0),
});
export type EstimationModuleSummary = z.infer<typeof estimationModuleSummarySchema>;

export const estimationScenarioSchema = z.object({
  developerCount: z.number().int().min(1).max(20),
  totalHours: z.number().min(0),
  durationWeeks: z.number().min(0),
  durationMonths: z.number().min(0),
});
export type EstimationScenario = z.infer<typeof estimationScenarioSchema>;

export const estimationResultSchema = z.object({
  projectId: uuidSchema,
  version: z.number().int().positive(),
  status: estimationStatusSchema,
  baseHours: z.number().min(0),
  reservePercent: z.number().min(0).max(100),
  reserveHours: z.number().min(0),
  totalHours: z.number().min(0),
  wbs: z.array(estimationWbsItemSchema),
  modules: z.array(estimationModuleSummarySchema),
  teamLoad: z.array(estimationRoleEffortSchema),
  scenarios: z.array(estimationScenarioSchema),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  exclusions: z.array(z.string()),
  generatedAt: isoDateTimeSchema,
});
export type EstimationResult = z.infer<typeof estimationResultSchema>;


export const ESTIMATION_POC_ROLE_UNITS = ['week', 'day'] as const;
export const estimationPocRoleUnitSchema = z.enum(ESTIMATION_POC_ROLE_UNITS);
export type EstimationPocRoleUnit = z.infer<typeof estimationPocRoleUnitSchema>;

export const ESTIMATION_CREATION_MODES = ['ai', 'standard', 'rpa'] as const;
export const estimationCreationModeSchema = z.enum(ESTIMATION_CREATION_MODES);
export type EstimationCreationMode = z.infer<typeof estimationCreationModeSchema>;

export const analyzeEstimationPocSchema = z.object({
  projectId: uuidSchema,
  projectName: nonEmptyTrimmed(300, 'El nombre del proyecto'),
  clientName: z.string().trim().max(300).nullish(),
  driveFolderUrl: z.url({ message: 'La carpeta de Drive no tiene un formato válido.' }),
  instructions: z.string().trim().max(3000).nullish(),
});
export type AnalyzeEstimationPocInput = z.infer<typeof analyzeEstimationPocSchema>;

export const generateEstimationPocSchema = analyzeEstimationPocSchema.extend({
  answers: z.array(submitEstimationAnswerSchema).default([]),
});
export type GenerateEstimationPocInput = z.infer<typeof generateEstimationPocSchema>;

export const estimationPocRoleDraftSchema = z.object({
  role: nonEmptyTrimmed(120, 'El rol'),
  unit: estimationPocRoleUnitSchema,
  duration: z.number().min(0),
  hoursPerUnit: z.number().min(0),
  people: z.number().min(0),
  source: z.string().trim().max(1500).nullish(),
});
export type EstimationPocRoleDraft = z.infer<typeof estimationPocRoleDraftSchema>;

export const estimationPocAiDraftSchema = z.object({
  summary: nonEmptyTrimmed(3000, 'El resumen'),
  roles: z.array(estimationPocRoleDraftSchema).min(1),
  assumptions: z.array(z.string().trim().min(1).max(1500)).default([]),
  clarifyingQuestions: z.array(z.string().trim().min(1).max(1500)).max(5).default([]),
});
export type EstimationPocAiDraft = z.infer<typeof estimationPocAiDraftSchema>;

export const estimationPocRoleSchema = estimationPocRoleDraftSchema.extend({
  totalHours: z.number().min(0),
});
export type EstimationPocRole = z.infer<typeof estimationPocRoleSchema>;

export const estimationPocProposalSchema = z.object({
  projectId: uuidSchema,
  provider: z.string().trim().min(1).max(120),
  sourceMode: z.enum(['poc_simulated', 'drive']),
  documentsAnalyzed: z.number().int().min(0),
  summary: nonEmptyTrimmed(3000, 'El resumen'),
  roles: z.array(estimationPocRoleSchema).min(1),
  totalHours: z.number().min(0),
  assumptions: z.array(z.string().trim().min(1).max(1500)).default([]),
  clarifyingQuestions: z.array(z.string().trim().min(1).max(1500)).max(5).default([]),
});
export type EstimationPocProposal = z.infer<typeof estimationPocProposalSchema>;


export const estimationPocAnalysisSchema = z.object({
  projectId: uuidSchema,
  provider: z.string().trim().min(1).max(120),
  sourceMode: z.enum(['poc_simulated', 'drive']),
  documentsAnalyzed: z.number().int().min(0),
  summary: nonEmptyTrimmed(3000, 'El resumen'),
  detectedDocuments: z.array(z.string().trim().min(1).max(500)).default([]),
  dynamicQuestions: z.array(estimationQuestionSchema).max(5).default([]),
});
export type EstimationPocAnalysis = z.infer<typeof estimationPocAnalysisSchema>;


export const listEstimationDriveFilesSchema = z.object({
  driveFolderUrl: z
    .url({ message: 'La carpeta de Drive no tiene un formato válido.' })
    .refine((value) => {
      try {
        return new URL(value).hostname === 'drive.google.com';
      } catch {
        return false;
      }
    }, 'La URL debe pertenecer a drive.google.com.'),
});
export type ListEstimationDriveFilesInput = z.infer<typeof listEstimationDriveFilesSchema>;

export const ESTIMATION_DRIVE_FILE_KINDS = [
  'document',
  'spreadsheet',
  'presentation',
  'pdf',
  'image',
  'other',
] as const;
export const estimationDriveFileKindSchema = z.enum(ESTIMATION_DRIVE_FILE_KINDS);
export type EstimationDriveFileKind = z.infer<typeof estimationDriveFileKindSchema>;

export const estimationDriveFileSchema = z.object({
  id: z.string().trim().min(1),
  name: nonEmptyTrimmed(500, 'El nombre del archivo'),
  mimeType: z.string().trim().min(1),
  kind: estimationDriveFileKindSchema,
  modifiedAt: isoDateTimeSchema,
  webViewLink: z.url().nullish(),
  sizeBytes: z.number().int().min(0).nullish(),
});
export type EstimationDriveFile = z.infer<typeof estimationDriveFileSchema>;

export const estimationDriveFolderListingSchema = z.object({
  folderId: z.string().trim().min(1),
  folderUrl: z.url(),
  connection: z.enum(['connected', 'not_configured', 'unavailable']),
  files: z.array(estimationDriveFileSchema).default([]),
  message: z.string().trim().max(1000).nullish(),
});
export type EstimationDriveFolderListing = z.infer<typeof estimationDriveFolderListingSchema>;
