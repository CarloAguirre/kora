import { z } from 'zod';

/**
 * Resultado del importador de datos legacy por archivo — ver
 * `docs/DECISION` del módulo `admin` en `apps/api`. Cada paso corresponde a
 * una entidad migrada (o podada) del pipeline en `@kora/etl`.
 */
export const legacyImportStepResultSchema = z.object({
  step: z.string(),
  read: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  deleted: z.number().int(),
  warnings: z.array(z.string()),
});
export type LegacyImportStepResult = z.infer<typeof legacyImportStepResultSchema>;

export const legacyImportResponseSchema = z.object({
  /** true si fue un ensayo (nada se escribió) — la transacción se revirtió. */
  dryRun: z.boolean(),
  durationMs: z.number(),
  steps: z.array(legacyImportStepResultSchema),
  totalWarnings: z.number().int(),
  /** Errores de formato del archivo que impidieron correr el pipeline (archivo vacío, tabla requerida ausente, JSON inválido). */
  parseErrors: z.array(z.string()),
});
export type LegacyImportResponse = z.infer<typeof legacyImportResponseSchema>;
