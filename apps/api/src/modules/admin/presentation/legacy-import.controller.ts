import { Controller, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ValidationError } from '@kora/core';
import type { LegacyImportResponse } from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { RunLegacyImportUseCase } from '../application/use-cases/run-legacy-import.use-case';

/**
 * Importador de datos legacy por archivo — ver el plan del módulo.
 *
 * `dryRun` es `true` por defecto: hace falta pasar `?dryRun=false` a propósito
 * para que el borrado+reemplazo se ejecute de verdad. Es la misma idea que
 * `DRY_RUN=true` en `tools/etl`, pero invertida como default porque acá el
 * disparador es un botón, no una variable de entorno que hay que setear a mano.
 */
@Controller('admin/legacy-import')
export class LegacyImportController {
  constructor(private readonly runLegacyImport: RunLegacyImportUseCase) {}

  @Post()
  @RequirePermissions('admin:legacy_import')
  async run(@Req() request: FastifyRequest, @Query('dryRun') dryRunParam?: string): Promise<LegacyImportResponse> {
    const file = await request.file();
    if (!file) {
      throw new ValidationError('Debes adjuntar el archivo del dump legacy.', 'LEGACY_IMPORT_FILE_MISSING');
    }

    const fileBuffer = await file.toBuffer();
    const dryRun = dryRunParam !== 'false';

    return unwrapOrThrow(await this.runLegacyImport.execute({ fileBuffer, dryRun }));
  }
}
