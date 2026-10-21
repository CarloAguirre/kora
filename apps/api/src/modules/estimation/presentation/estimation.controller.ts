import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  analyzeEstimationPocSchema,
  generateEstimationPocSchema,
  inventoryEstimationDriveSchema,
  listEstimationDriveFilesSchema,
  resolveEstimationDriveFolderSchema,
  type AnalyzeEstimationPocInput,
  type EstimationDriveFolderListing,
  type EstimationDriveFolderResolution,
  type EstimationDriveInventory,
  type EstimationPocAnalysis,
  type EstimationPocProposal,
  type EstimationQuestionnaireDefinition,
  type GenerateEstimationPocInput,
  type InventoryEstimationDriveInput,
  type ListEstimationDriveFilesInput,
  type ResolveEstimationDriveFolderInput,
} from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { AnalyzeEstimationPocUseCase } from '../application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { InventoryEstimationDriveUseCase } from '../application/use-cases/inventory-estimation-drive.use-case';
import { ListEstimationDriveFilesUseCase } from '../application/use-cases/list-estimation-drive-files.use-case';
import { ResolveEstimationDriveFolderUseCase } from '../application/use-cases/resolve-estimation-drive-folder.use-case';

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
    private readonly analyzePoc: AnalyzeEstimationPocUseCase,
    private readonly generatePocProposal: GenerateEstimationPocProposalUseCase,
    private readonly listDriveFiles: ListEstimationDriveFilesUseCase,
    private readonly resolveDriveFolder: ResolveEstimationDriveFolderUseCase,
    private readonly inventoryDrive: InventoryEstimationDriveUseCase,
  ) {}

  @Get('questionnaire-definition')
  @RequirePermissions('projects:manage')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
  }

  @Post('drive/resolve')
  @RequirePermissions('projects:manage')
  driveResolve(
    @Body(new ZodValidationPipe(resolveEstimationDriveFolderSchema))
    input: ResolveEstimationDriveFolderInput,
  ): Promise<EstimationDriveFolderResolution> {
    return this.resolveDriveFolder.execute(input);
  }

  @Post('drive/inventory')
  @RequirePermissions('projects:manage')
  driveInventory(
    @Body(new ZodValidationPipe(inventoryEstimationDriveSchema))
    input: InventoryEstimationDriveInput,
  ): Promise<EstimationDriveInventory> {
    return this.inventoryDrive.execute(input);
  }

  @Post('drive/files')
  @RequirePermissions('projects:manage')
  driveFiles(
    @Body(new ZodValidationPipe(listEstimationDriveFilesSchema))
    input: ListEstimationDriveFilesInput,
  ): Promise<EstimationDriveFolderListing> {
    return this.listDriveFiles.execute(input);
  }

  @Post('poc/analyze')
  @RequirePermissions('projects:manage')
  analyze(
    @Body(new ZodValidationPipe(analyzeEstimationPocSchema)) input: AnalyzeEstimationPocInput,
  ): Promise<EstimationPocAnalysis> {
    return this.analyzePoc.execute(input);
  }

  /**
   * Segunda etapa de la PoC: genera la propuesta solo después de recibir las
   * respuestas del cuestionario. Las HH se calculan determinísticamente.
   */
  @Post('poc/proposal')
  @RequirePermissions('projects:manage')
  proposal(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
  ): Promise<EstimationPocProposal> {
    return this.generatePocProposal.execute(input);
  }
}
