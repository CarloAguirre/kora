import { z } from 'zod';
import { uuidSchema } from '../common/primitives';
import {
  quotationCurrencySchema,
  quotationExternalCostSchema,
  quotationPaymentItemSchema,
  quotationPhaseDraftSchema,
  quotationTaxSchema,
  quotationTeamDraftSchema,
  quotationVersionOriginSchema,
  quotationVersionStatusSchema,
} from './quotation.contract';
import { quotationCommercialPreflightSchema } from './quotation-commercial-preflight.contract';

/** Expediente interno R3-g. No es un documento comercial enviable ni una firma. */
export const quotationCommercialDossierSchema = z.object({
  schemaVersion: z.literal('kora.quotation.commercial-dossier.v1'),
  documentStatus: z.literal('internal_review_only'),
  deliveryEnabled: z.literal(false),
  commercialApprovalEnabled: z.literal(false),
  transferEnabled: z.literal(false),
  projectId: uuidSchema,
  versionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
  versionUpdatedAt: z.string().datetime(),
  generatedAt: z.string().datetime(),
  quotation: z.object({
    name: z.string(),
    status: quotationVersionStatusSchema,
    origin: quotationVersionOriginSchema,
    aiReviewStatus: z.enum(['pending', 'accepted']).nullable(),
    currency: quotationCurrencySchema,
    tax: quotationTaxSchema,
    hourlyRate: z.number().nullable(),
    totalHours: z.number().nonnegative(),
    netAmount: z.number().nullable(),
    totalAmount: z.number().nullable(),
    mode: z.enum(['team', 'phases']),
    teams: z.array(quotationTeamDraftSchema.extend({
      name: z.string().nullable(),
      isActive: z.boolean(),
      capacityReferenceHours: z.number().nonnegative(),
      quotedHours: z.number().nonnegative(),
    })),
    phases: z.array(quotationPhaseDraftSchema),
    costs: z.array(quotationExternalCostSchema),
    paymentPlan: z.array(quotationPaymentItemSchema),
    assumptions: z.array(z.string()),
    exclusions: z.array(z.string()),
    sourcesCount: z.number().int().nonnegative(),
    aiEvidence: z.object({
      mode: z.enum(['none', 'simulated_fixture', 'model_generated']),
      provider: z.string().nullable(),
      model: z.string().nullable(),
      label: z.string().nullable(),
      sourceFileCount: z.number().int().nonnegative(),
    }),
  }),
  validation: quotationCommercialPreflightSchema,
  /** Las decisiones de negocio se mantienen explícitamente pendientes. */
  outstandingBusinessGates: z.array(z.object({
    id: z.enum(['D02', 'D05', 'D06']),
    status: z.literal('pending'),
    description: z.string(),
  })).length(3),
  notes: z.array(z.string()),
});
export type QuotationCommercialDossier = z.infer<typeof quotationCommercialDossierSchema>;
