import { z } from 'zod';
import { uuidSchema } from '../common/primitives';

/** Verificación documental de SOLO LECTURA. No habilita envío comercial. */
export const quotationCommercialPreflightSchema = z.object({
  projectId: uuidSchema,
  versionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
  calculatedAt: z.string().datetime(),
  sendEnabled: z.literal(false),
  contentChecksPassed: z.boolean(),
  blockerCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  summary: z.object({
    mode: z.enum(['team', 'phases']),
    teamCount: z.number().int().nonnegative(),
    phaseCount: z.number().int().nonnegative(),
    totalHours: z.number().nonnegative(),
    paymentPercent: z.number().nonnegative(),
    netAmount: z.number().nullable(),
    totalAmount: z.number().nullable(),
  }),
  findings: z.array(z.object({
    code: z.string(),
    section: z.enum(['version', 'teams', 'scope', 'hours', 'pricing', 'payments', 'ai', 'project', 'policy']),
    severity: z.enum(['blocker', 'warning']),
    message: z.string(),
  })),
  pendingDecisionIds: z.array(z.enum(['D02', 'D05', 'D06'])),
});
export type QuotationCommercialPreflight = z.infer<typeof quotationCommercialPreflightSchema>;

export interface QuotationTeamCatalogEntry {
  teamId: string;
  name: string;
  isActive: boolean;
}
