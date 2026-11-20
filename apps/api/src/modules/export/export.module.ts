import { Module } from '@nestjs/common';
import { KORA_EXPORT_READER } from './application/ports/kora-export-reader.port';
import { GetKoraExportUseCase } from './application/use-cases/get-kora-export.use-case';
import { DrizzleKoraExportReader } from './infrastructure/drizzle-kora-export.reader';
import { ExportController } from './presentation/export.controller';

/** Volcado de solo lectura de Kora en JSON para integraciones/reportes externos. */
@Module({
  controllers: [ExportController],
  providers: [GetKoraExportUseCase, { provide: KORA_EXPORT_READER, useClass: DrizzleKoraExportReader }],
})
export class ExportModule {}
