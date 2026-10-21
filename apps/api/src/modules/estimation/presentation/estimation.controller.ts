import { Controller, Get } from '@nestjs/common';
import type { EstimationQuestionnaireDefinition } from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { GetEstimationQuestionnaireDefinitionUseCase } from '../application/use-cases/get-estimation-questionnaire-definition.use-case';

@Controller('estimations')
export class EstimationController {
  constructor(
    private readonly getQuestionnaireDefinition: GetEstimationQuestionnaireDefinitionUseCase,
  ) {}

  /**
   * Primer vertical slice del módulo: contrato real API↔web para el cuestionario.
   * Aún no inicia análisis de Drive ni persiste estimaciones.
   */
  @Get('questionnaire-definition')
  @RequirePermissions('projects:manage')
  definition(): EstimationQuestionnaireDefinition {
    return this.getQuestionnaireDefinition.execute();
  }
}
