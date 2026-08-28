import { Inject, Injectable } from '@nestjs/common';
import { err, ok, ValidationError, type ApplicationError, type Result } from '@kora/core';
import type { LegacyImportResponse } from '@kora/contracts';
import type { UseCase } from '../../../../shared/application/use-case';
import { parseLegacyDumpCsv } from '../../infrastructure/parsing/legacy-dump-parser';
import { LEGACY_IMPORT_RUNNER, type LegacyImportRunner } from '../ports/legacy-import-runner.port';

export interface RunLegacyImportCommand {
  readonly fileBuffer: Buffer;
  readonly dryRun: boolean;
}

/**
 * Importa el dump legacy subido por archivo, reemplazando catálogos,
 * clientes, proyectos, horas, tickets y forecast por lo que trae el archivo —
 * ver el plan del módulo admin. `dryRun=true` corre todo el pipeline (incluida
 * la poda) dentro de una transacción que se revierte al final, así que la
 * vista previa nunca escribe nada de verdad.
 */
@Injectable()
export class RunLegacyImportUseCase implements UseCase<RunLegacyImportCommand, LegacyImportResponse, ApplicationError> {
  constructor(@Inject(LEGACY_IMPORT_RUNNER) private readonly runner: LegacyImportRunner) {}

  async execute(command: RunLegacyImportCommand): Promise<Result<LegacyImportResponse, ApplicationError>> {
    const parsed = parseLegacyDumpCsv(command.fileBuffer);

    if (!parsed.dump) {
      return ok({
        dryRun: command.dryRun,
        durationMs: 0,
        steps: [],
        totalWarnings: 0,
        parseErrors: parsed.errors,
      });
    }

    try {
      const result = await this.runner.run({ dump: parsed.dump, dryRun: command.dryRun });
      return ok({ ...result, parseErrors: [] });
    } catch (error) {
      return err(
        new ValidationError(
          `La importación falló: ${(error as Error).message}. No se escribió nada (se revirtió la transacción).`,
          'LEGACY_IMPORT_FAILED',
          { cause: error },
        ),
      );
    }
  }
}
