import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  analyzeEstimationPocSchema,
  generateEstimationPocSchema,
  listEstimationDriveFilesSchema,
  type AnalyzeEstimationPocInput,
  type EstimationDriveFolderListing,
  type EstimationPocAnalysis,
  type EstimationPocProposal,
  type EstimationQuestionnaireDefinition,
  type GenerateEstimationPocInput,
  type ListEstimationDriveFilesInput,
} from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { AnalyzeEstimationPocUseCase } from '../application/use-cases/analyze-estimation-poc.use-case';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';
import { ListEstimationDriveFilesUseCase } from '../application/use-cases/list-estimation-drive-files.use-case';

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
    private readonly analyzePoc: AnalyzeEstimationPocUseCase,
    private readonly generatePocProposal: GenerateEstimationPocProposalUseCase,
    private readonly listDriveFiles: ListEstimationDriveFilesUseCase,
  ) {}

  @Get('questionnaire-definition')
  @RequirePermissions('projects:manage')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
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
