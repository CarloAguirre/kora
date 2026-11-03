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
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ManageQuotationDraftsUseCase } from '../application/use-cases/manage-quotation-drafts.use-case';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { AnalyzeEstimationPocUseCase } from '../application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { InventoryEstimationDriveUseCase } from '../application/use-cases/inventory-estimation-drive.use-case';
import { ListEstimationDriveFilesUseCase } from '../application/use-cases/list-estimation-drive-files.use-case';
import { ResolveEstimationDriveFolderUseCase } from '../application/use-cases/resolve-estimation-drive-folder.use-case';
import { validateFixedQuestionnaireAnswers } from '../application/validate-estimation-questionnaire';

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
    private readonly analyzePoc: AnalyzeEstimationPocUseCase,
    private readonly generatePocProposal: GenerateEstimationPocProposalUseCase,
    private readonly listDriveFiles: ListEstimationDriveFilesUseCase,
    private readonly resolveDriveFolder: ResolveEstimationDriveFolderUseCase,
    private readonly inventoryDrive: InventoryEstimationDriveUseCase,
    private readonly quotationDrafts: ManageQuotationDraftsUseCase,
  ) {}

  @Get('questionnaire-definition')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
  }

  @Post('drive/resolve')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async driveResolve(
    @Body(new ZodValidationPipe(resolveEstimationDriveFolderSchema))
    input: ResolveEstimationDriveFolderInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationDriveFolderResolution> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
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
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async analyze(
    @Body(new ZodValidationPipe(analyzeEstimationPocSchema)) input: AnalyzeEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocAnalysis> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return this.analyzePoc.execute(input);
  }

  /**
   * R4-a: ruta estricta del nuevo flujo de cuestionario.
   * El endpoint PoC heredado se conserva para compatibilidad, pero la nueva
   * pantalla no permite enviar answers=[] ni IDs no definidos.
   */
  @Post('poc/proposal-answered')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async proposalAnswered(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocProposal> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    validateFixedQuestionnaireAnswers(this.getQuestionnaireDefinition.execute(), input.answers);
    return this.generatePocProposal.execute(input);
  }

  /**
   * Segunda etapa de la PoC: genera la propuesta solo después de recibir las
   * respuestas del cuestionario. Las HH se calculan determinísticamente.
   */
  @Post('poc/proposal')
  @RequireAnyPermission('projects:manage', 'projects:read_assigned')
  async proposal(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<EstimationPocProposal> {
    await this.quotationDrafts.authorizeAiPoc(input.projectId, actor);
    return this.generatePocProposal.execute(input);
  }
}
