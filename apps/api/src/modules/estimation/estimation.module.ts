import { Module } from '@nestjs/common';
import { GetEstimationQuestionnaireDefinitionUseCase } from './application/use-cases/get-estimation-questionnaire-definition.use-case';
import { EstimationController } from './presentation/estimation.controller';

/**
 * Módulo de Estimación Inteligente.
 *
 * Esta primera iteración registra únicamente el contrato del cuestionario.
 * Drive, proveedor IA y persistencia entrarán como adaptadores de los puertos
 * ya definidos, sin cambiar los consumidores.
 */
@Module({
  controllers: [EstimationController],
  providers: [GetEstimationQuestionnaireDefinitionUseCase],
})
export class EstimationModule {}
