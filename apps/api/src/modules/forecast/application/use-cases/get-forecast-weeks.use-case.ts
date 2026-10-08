import { Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ForecastWeeksResponse } from '@kora/contracts';
import { ForecastCapacityService } from '../services/forecast-capacity.service';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetForecastWeeksCommand {
  readonly firstMonday: Date;
  readonly weeks: number;
}

/** "Próximas semanas": carga por colaborador en varias semanas seguidas. */
@Injectable()
export class GetForecastWeeksUseCase implements UseCase<GetForecastWeeksCommand, ForecastWeeksResponse, ApplicationError> {
  constructor(private readonly capacity: ForecastCapacityService) {}

  async execute(command: GetForecastWeeksCommand): Promise<Result<ForecastWeeksResponse, ApplicationError>> {
    return ok(await this.capacity.getWeeksSummary(command.firstMonday, command.weeks));
  }
}
