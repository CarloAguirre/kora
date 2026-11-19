import { Controller, Get, Query } from '@nestjs/common';
import { koraExportQuerySchema, type KoraExport, type KoraExportQuery } from '@kora/contracts';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { GetKoraExportUseCase } from '../application/use-cases/get-kora-export.use-case';

/**
 * TEMPORAL: público, sin token, mientras se prueba la integración.
 * Antes de subirlo a producción volver a protegerlo — quitar `@Public()` y
 * restaurar `@RequirePermissions('clients:read', 'projects:read')` (admin/PMO),
 * o reemplazarlo por una API key. Expone datos de todos los clientes.
 */
@Controller('export')
export class ExportController {
  constructor(private readonly getKoraExport: GetKoraExportUseCase) {}

  /** `GET /export/kora?updatesLimit=5` — cliente → proyectos → personas y bitácora reciente. */
  @Get('kora')
  @Public()
  async kora(@Query(new ZodValidationPipe(koraExportQuerySchema)) query: KoraExportQuery): Promise<KoraExport> {
    return unwrapOrThrow(await this.getKoraExport.execute({ updatesLimit: query.updatesLimit }));
  }
}
