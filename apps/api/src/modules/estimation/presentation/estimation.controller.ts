import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  generateEstimationPocSchema,
  type EstimationPocProposal,
  type EstimationQuestionnaireDefinition,
  type GenerateEstimationPocInput,
} from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { GenerateEstimationPocProposalUseCase } from '../application/use-cases/generate-estimation-poc-proposal.use-case';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
    private readonly generatePocProposal: GenerateEstimationPocProposalUseCase,
  ) {}

  @Get('questionnaire-definition')
  @RequirePermissions('projects:manage')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
  }

  /**
   * PoC del boundary Calculadora -> módulo IA.
   *
   * El proveedor actual es simulado y NO lee Drive; la URL se conserva en el
   * contrato porque es la entrada que utilizará el lector real en la siguiente
   * iteración. Las HH se calculan determinísticamente en el caso de uso.
   */
  @Post('poc/proposal')
  @RequirePermissions('projects:manage')
  proposal(
    @Body(new ZodValidationPipe(generateEstimationPocSchema)) input: GenerateEstimationPocInput,
  ): Promise<EstimationPocProposal> {
    return this.generatePocProposal.execute(input);
  }
}
