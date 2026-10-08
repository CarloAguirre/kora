import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { ForecastRecalculateResponse } from '@kora/contracts';
import { FORECAST_SOURCE_CALCULATOR, type ForecastSourceCalculator } from '../ports/forecast-source-calculator.port';
import type { UseCase } from '../../../../shared/application/use-case';

/**
 * "Recalcular desde proyectos": útil cuando cambia algo que no dispara el cálculo por sí solo
 * (jornada semanal de una persona, feriados) y para calcular por primera vez las tareas existentes.
 * Respeta los ajustes del líder igual que el cálculo automático, así que se puede correr cuando sea.
 */
@Injectable()
export class RecalculateForecastUseCase implements UseCase<void, ForecastRecalculateResponse, ApplicationError> {
  constructor(
    @Inject(FORECAST_SOURCE_CALCULATOR) private readonly calculator: ForecastSourceCalculator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<ForecastRecalculateResponse, ApplicationError>> {
    return ok(await this.calculator.recalculateAll(this.clock.now()));
  }
}
