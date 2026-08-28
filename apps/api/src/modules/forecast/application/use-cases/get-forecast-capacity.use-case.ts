import { Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ForecastCapacityResponse } from '@kora/contracts';
import { ForecastCapacityService } from '../services/forecast-capacity.service';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetForecastCapacityCommand {
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Reemplaza el RPC `get_forecast_capacity_view` de la v1: la agregación por
 * colaborador ocurre en el backend (`ForecastCapacityService`), no en el
 * cliente (`buildColaboradores` en `Forecast/index.tsx`). Ver
 * docs/DECISION-M6-FORECAST.md.
 */
@Injectable()
export class GetForecastCapacityUseCase implements UseCase<GetForecastCapacityCommand, ForecastCapacityResponse, ApplicationError> {
  constructor(private readonly capacity: ForecastCapacityService) {}

  async execute(command: GetForecastCapacityCommand): Promise<Result<ForecastCapacityResponse, ApplicationError>> {
    const { periodStart, periodEnd } = command;
    const members = await this.capacity.getCapacitySummary(periodStart, periodEnd);
    return ok({ periodStart: toIsoDate(periodStart), periodEnd: toIsoDate(periodEnd), members });
  }
}
