import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { koraExportQuerySchema, type KoraExport, type KoraExportQuery } from '@kora/contracts';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { GetKoraExportUseCase } from '../application/use-cases/get-kora-export.use-case';
import { ExportApiKeyGuard } from './export-api-key.guard';

/**
 * Sin sesión (`@Public()` salta el JWT) pero con API key: lo consumen
 * integraciones externas vía header `X-Api-Key` (ver `ExportApiKeyGuard`).
 * Expone datos de todos los clientes — la clave no se comparte fuera del equipo.
 */
@Controller('export')
export class ExportController {
  constructor(private readonly getKoraExport: GetKoraExportUseCase) {}

  /** `GET /export/kora?updatesLimit=5` — cliente → proyectos → personas y bitácora reciente. */
  @Get('kora')
  @Public()
  @UseGuards(ExportApiKeyGuard)
  async kora(@Query(new ZodValidationPipe(koraExportQuerySchema)) query: KoraExportQuery): Promise<KoraExport> {
    return unwrapOrThrow(await this.getKoraExport.execute({ updatesLimit: query.updatesLimit }));
  }
}
