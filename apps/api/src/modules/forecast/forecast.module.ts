import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { ProjectsModule } from '../projects/projects.module';
import { ClientsModule } from '../clients/clients.module';
import { ForecastController } from './presentation/forecast.controller';

import { ListForecastAssignmentsUseCase } from './application/use-cases/list-forecast-assignments.use-case';
import { CreateForecastAssignmentUseCase } from './application/use-cases/create-forecast-assignment.use-case';
import { UpdateForecastAssignmentUseCase } from './application/use-cases/update-forecast-assignment.use-case';
import { DeleteForecastAssignmentUseCase } from './application/use-cases/delete-forecast-assignment.use-case';
import { GetForecastCapacityUseCase } from './application/use-cases/get-forecast-capacity.use-case';
import { ListForecastHistoryUseCase } from './application/use-cases/list-forecast-history.use-case';
import { ResetForecastAssignmentUseCase } from './application/use-cases/reset-forecast-assignment.use-case';
import { KeepForecastAdjustmentUseCase } from './application/use-cases/keep-forecast-adjustment.use-case';
import { GetForecastWeeksUseCase } from './application/use-cases/get-forecast-weeks.use-case';
import { RecalculateForecastUseCase } from './application/use-cases/recalculate-forecast.use-case';
import { PreviewForecastLoadUseCase } from './application/use-cases/preview-forecast-load.use-case';
import { ForecastCapacityService } from './application/services/forecast-capacity.service';
import { ForecastAssignmentHistory } from './application/services/forecast-assignment-history';

import { FORECAST_ASSIGNMENT_REPOSITORY } from './domain/repositories/forecast-assignment.repository';
import { FORECAST_TEAM_READER } from './application/ports/forecast-team-reader.port';
import { FORECAST_PROJECT_READER } from './application/ports/forecast-project-reader.port';
import { FORECAST_CLIENT_READER } from './application/ports/forecast-client-reader.port';
import { FORECAST_HOLIDAY_READER } from './application/ports/forecast-holiday-reader.port';
import { FORECAST_PLANNING_SIGNALS_READER } from './application/ports/forecast-planning-signals-reader.port';
import { FORECAST_SOURCE_CALCULATOR } from './application/ports/forecast-source-calculator.port';

import { DrizzleForecastAssignmentRepository } from './infrastructure/persistence/drizzle-forecast-assignment.repository';
import { TeamsModuleForecastTeamReader } from './infrastructure/services/teams-module-forecast-team-reader';
import { ProjectsModuleForecastProjectReader } from './infrastructure/services/projects-module-forecast-project-reader';
import { ClientsModuleForecastClientReader } from './infrastructure/services/clients-module-forecast-client-reader';
import { DrizzleForecastHolidayReader } from './infrastructure/services/drizzle-forecast-holiday-reader';
import { DrizzleForecastPlanningSignalsReader } from './infrastructure/services/drizzle-forecast-planning-signals-reader';
import { ProjectsModuleForecastSourceCalculator } from './infrastructure/services/projects-module-forecast-source-calculator';

/** M6 — ver docs/DECISION-M6-FORECAST.md. */
@Module({
  imports: [TeamsModule, ProjectsModule, ClientsModule],
  controllers: [ForecastController],
  providers: [
    ListForecastAssignmentsUseCase,
    CreateForecastAssignmentUseCase,
    UpdateForecastAssignmentUseCase,
    DeleteForecastAssignmentUseCase,
    GetForecastCapacityUseCase,
    ListForecastHistoryUseCase,
    ResetForecastAssignmentUseCase,
    KeepForecastAdjustmentUseCase,
    GetForecastWeeksUseCase,
    RecalculateForecastUseCase,
    PreviewForecastLoadUseCase,
    ForecastCapacityService,
    ForecastAssignmentHistory,

    { provide: FORECAST_ASSIGNMENT_REPOSITORY, useClass: DrizzleForecastAssignmentRepository },
    { provide: FORECAST_TEAM_READER, useClass: TeamsModuleForecastTeamReader },
    { provide: FORECAST_PROJECT_READER, useClass: ProjectsModuleForecastProjectReader },
    { provide: FORECAST_CLIENT_READER, useClass: ClientsModuleForecastClientReader },
    { provide: FORECAST_HOLIDAY_READER, useClass: DrizzleForecastHolidayReader },
    { provide: FORECAST_PLANNING_SIGNALS_READER, useClass: DrizzleForecastPlanningSignalsReader },
    { provide: FORECAST_SOURCE_CALCULATOR, useClass: ProjectsModuleForecastSourceCalculator },
  ],
  /** `ForecastCapacityService` se exporta para que el panel (M7) reutilice el cálculo de capacidad sin encadenar casos de uso. */
  exports: [FORECAST_ASSIGNMENT_REPOSITORY, ForecastCapacityService],
})
export class ForecastModule {}
