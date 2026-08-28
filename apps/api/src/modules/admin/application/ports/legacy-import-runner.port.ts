import type { StepResult } from '@kora/etl';

export type { StepResult as LegacyImportStepResult } from '@kora/etl';

export interface LegacyImportRunResult {
  readonly dryRun: boolean;
  readonly durationMs: number;
  readonly steps: StepResult[];
  readonly totalWarnings: number;
}

export interface LegacyImportRunInput {
  readonly dump: Readonly<Record<string, unknown[]>>;
  readonly dryRun: boolean;
}

/**
 * Puerto hacia el pipeline de importación (`@kora/etl`, sobre el dump legacy
 * subido por archivo). Solo la infraestructura inyecta `DATABASE` — ver el
 * comentario en `database.module.ts` — así que el caso de uso depende de este
 * puerto, no de Drizzle directamente.
 */
export interface LegacyImportRunner {
  run(input: LegacyImportRunInput): Promise<LegacyImportRunResult>;
}

export const LEGACY_IMPORT_RUNNER = Symbol('LegacyImportRunner');
