import { Module } from '@nestjs/common';
import { LegacyImportController } from './presentation/legacy-import.controller';
import { RunLegacyImportUseCase } from './application/use-cases/run-legacy-import.use-case';
import { LEGACY_IMPORT_RUNNER } from './application/ports/legacy-import-runner.port';
import { DrizzleLegacyImportRunner } from './infrastructure/persistence/drizzle-legacy-import-runner';

@Module({
  controllers: [LegacyImportController],
  providers: [RunLegacyImportUseCase, { provide: LEGACY_IMPORT_RUNNER, useClass: DrizzleLegacyImportRunner }],
})
export class AdminModule {}
