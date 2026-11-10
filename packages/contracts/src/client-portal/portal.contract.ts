import { z } from 'zod';
import { uuidSchema } from '../common/primitives';

/** Autorización de contacto externo: todos los IDs se verifican por empresa en API. */
export const clientPortalGrantInputSchema = z.object({
  enabled: z.boolean(),
  projectIds: z.array(uuidSchema).max(200).refine(
    (ids) => new Set(ids).size === ids.length,
    'Los proyectos no pueden estar repetidos.',
  ),
  supportPlanIds: z.array(uuidSchema).max(200).refine(
    (ids) => new Set(ids).size === ids.length,
    'Los contratos no pueden estar repetidos.',
  ),
}).strict();

export type ClientPortalGrantInput = z.infer<typeof clientPortalGrantInputSchema>;

export const clientPortalReceiptSchema = z.object({
  deliveryId: uuidSchema,
  received: z.literal(true),
});
export type ClientPortalReceipt = z.infer<typeof clientPortalReceiptSchema>;
