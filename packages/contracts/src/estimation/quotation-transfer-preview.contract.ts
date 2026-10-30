import { z } from 'zod';
import { uuidSchema } from '../common/primitives';
import { quotationCurrencySchema, quotationVersionSchema } from './quotation.contract';
import { projectSalesStageSchema, projectStatusSchema } from '../projects/project.contract';

/** Datos operacionales LEÍDOS en el instante de calcular la vista previa.
 * No representan permiso de traspaso ni un snapshot transaccional apto para aplicar.
 */
export const quotationOperationalSnapshotSchema = z.object({
  projectId: uuidSchema,
  salesStage: projectSalesStageSchema.nullable(),
  status: projectStatusSchema,
  soldHours: z.number().nonnegative(),
  usedHours: z.number().nonnegative(),
  startDate: z.string().nullable(),
  contractAmount: z.number().nullable(),
  contractCurrency: quotationCurrencySchema,
  teams: z.array(z.object({
    teamId: uuidSchema,
    name: z.string(),
    assignedHours: z.number().nullable(),
    memberLimit: z.number().int().nullable(),
  })),
  moduleCount: z.number().int().nonnegative(),
  /** Sólo para análisis EDT. No se interpreta nombre coincidente como identidad. */
  executionModules: z.array(z.object({
    id: uuidSchema,
    name: z.string(),
    estimatedHours: z.number().nullable(),
    tasks: z.array(z.object({
      id: uuidSchema,
      name: z.string(),
      status: z.enum(['todo', 'in_progress', 'in_review', 'done']),
      estimatedHours: z.number().nullable(),
    })),
  })).optional(),
  taskCount: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative(),
  paymentMilestones: z.array(z.object({
    status: z.enum(['pending', 'to_invoice', 'invoiced', 'paid']),
    amount: z.number().nonnegative(),
  })),
});
export type QuotationOperationalSnapshot = z.infer<typeof quotationOperationalSnapshotSchema>;

export const quotationTransferPreviewSchema = z.object({
  projectId: uuidSchema,
  versionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  revision: z.number().int().positive(),
  calculatedAt: z.string().datetime(),
  /** Siempre falso hasta que se implemente R3 bajo las decisiones D04–D06. */
  transferEnabled: z.literal(false),
  proposed: z.object({
    status: quotationVersionSchema.shape.status,
    origin: quotationVersionSchema.shape.origin,
    aiReviewStatus: quotationVersionSchema.shape.aiReviewStatus,
    currency: quotationCurrencySchema,
    totalHours: z.number().nonnegative(),
    netAmount: z.number().nullable(),
    totalAmount: z.number().nullable(),
    hourlyRateDefined: z.boolean(),
    paymentPercent: z.number().nonnegative(),
  }),
  operational: z.object({
    salesStage: projectSalesStageSchema.nullable(),
    status: projectStatusSchema,
    soldHours: z.number().nonnegative(),
    usedHours: z.number().nonnegative(),
    startDate: z.string().nullable(),
    contractAmount: z.number().nullable(),
    contractCurrency: quotationCurrencySchema,
    moduleCount: z.number().int().nonnegative(),
    taskCount: z.number().int().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    milestoneCounts: z.object({
      pending: z.number().int().nonnegative(),
      toInvoice: z.number().int().nonnegative(),
      invoiced: z.number().int().nonnegative(),
      paid: z.number().int().nonnegative(),
    }),
  }),
  difference: z.object({
    soldHoursDelta: z.number(),
    remainingComparedToUsed: z.number(),
    /** Monto solo comparable si coincide exactamente la moneda. */
    netAmountDelta: z.number().nullable(),
  }),
  teams: z.array(z.object({
    teamId: uuidSchema,
    name: z.string(),
    currentAssignedHours: z.number().nullable(),
    proposedHours: z.number().nonnegative(),
    delta: z.number().nullable(),
    existsInProject: z.boolean(),
  })),
  /** Simulación de conciliación D04: jamás orden de crear/editar tareas. */
  edtReconciliation: z.object({
    source: z.enum(['analysis', 'modified_analysis', 'no_analysis']),
    activityCount: z.number().int().nonnegative(),
    proposedModuleCount: z.number().int().nonnegative(),
    proposedHours: z.number().nonnegative(),
    modules: z.array(z.object({
      name: z.string(),
      proposedHours: z.number().nonnegative(),
      existingCandidates: z.array(z.object({
        id: uuidSchema, name: z.string(), estimatedHours: z.number().nullable(),
        taskCount: z.number().int().nonnegative(),
      })),
      matchStatus: z.enum(['no_match', 'possible_match', 'ambiguous']),
      deltaVsExisting: z.number().nullable(),
      activities: z.array(z.object({
        wbs: z.string(), description: z.string(), role: z.string(),
        proposedHours: z.number().nonnegative(),
        possibleExistingTasks: z.array(z.object({
          id: uuidSchema, name: z.string(),
          status: z.enum(['todo', 'in_progress', 'in_review', 'done']),
          estimatedHours: z.number().nullable(),
        })),
      })),
    })),
    notes: z.array(z.string()),
  }),
  findings: z.array(z.object({
    code: z.string(),
    severity: z.enum(['blocker', 'review']),
    message: z.string(),
  })),
  pendingDecisionIds: z.array(z.enum(['D04', 'D05', 'D06'])),
});
export type QuotationTransferPreview = z.infer<typeof quotationTransferPreviewSchema>;
