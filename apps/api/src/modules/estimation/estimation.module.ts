import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DOCUMENT_SOURCE_READER } from './application/ports/document-source-reader.port';
import { DRIVE_FOLDER_CLIENT } from './application/ports/drive-folder-client.port';
import { AnalyzeEstimationPocUseCase } from './application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from './application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from './application/use-cases/get-estimation-questionnaire-definition.use-case';
import { InventoryEstimationDriveUseCase } from './application/use-cases/inventory-estimation-drive.use-case';
import { ListEstimationDriveFilesUseCase } from './application/use-cases/list-estimation-drive-files.use-case';
import { ResolveEstimationDriveFolderUseCase } from './application/use-cases/resolve-estimation-drive-folder.use-case';
import { GoogleDriveDocumentSourceReader } from './infrastructure/drive/google-drive-document-source.reader';
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
    ResolveEstimationDriveFolderUseCase,
    InventoryEstimationDriveUseCase,
    GoogleDriveFolderClient,
    GoogleDriveDocumentSourceReader,
    { provide: DRIVE_FOLDER_CLIENT, useExisting: GoogleDriveFolderClient },
    {
      provide: DOCUMENT_SOURCE_READER,
      useExisting: GoogleDriveDocumentSourceReader,
    },
  ],
})
export class EstimationModule {}
