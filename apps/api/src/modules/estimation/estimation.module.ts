import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AnalyzeEstimationPocUseCase } from './application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from './application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from './application/use-cases/get-estimation-questionnaire-definition.use-case';
import { ListEstimationDriveFilesUseCase } from './application/use-cases/list-estimation-drive-files.use-case';
import { DRIVE_FOLDER_CLIENT } from './application/ports/drive-folder-client.port';
import { GoogleDriveFolderClient } from './infrastructure/drive/google-drive-folder.client';
import { EstimationController } from './presentation/estimation.controller';

/**
 * Dominio backend de la Calculadora / Estimación Inteligente.
 *
 * Consume AiModule como capacidad técnica separada. La Calculadora conoce el
 * caso de uso de negocio; no conoce SDKs ni proveedores LLM concretos.
 */
@Module({
  imports: [AiModule],
  controllers: [EstimationController],
  providers: [
    GetEstimationQuestionnaireDefinitionUseCase,
    AnalyzeEstimationPocUseCase,
    GenerateEstimationPocProposalUseCase,
    ListEstimationDriveFilesUseCase,
    GoogleDriveFolderClient,
    { provide: DRIVE_FOLDER_CLIENT, useExisting: GoogleDriveFolderClient },
  ],
})
export class EstimationModule {}
