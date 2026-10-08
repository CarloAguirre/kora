import { Injectable } from '@nestjs/common';
import { ForecastSourceSyncService } from '../../../projects/application/services/forecast-source-sync.service';
import type { ForecastSourceCalculator, PlannedLoadWeek } from '../../application/ports/forecast-source-calculator.port';

@Injectable()
export class ProjectsModuleForecastSourceCalculator implements ForecastSourceCalculator {
  constructor(private readonly sync: ForecastSourceSyncService) {}

  recalculateAll(now: Date): Promise<{ segments: number; tasks: number }> {
    return this.sync.recalculateAll(now);
  }

  previewSegment(input: Parameters<ForecastSourceCalculator['previewSegment']>[0]): Promise<PlannedLoadWeek[]> {
    return this.sync.previewSegment(input);
  }

  previewTask(input: Parameters<ForecastSourceCalculator['previewTask']>[0]): Promise<PlannedLoadWeek[]> {
    return this.sync.previewTask(input);
  }
}
