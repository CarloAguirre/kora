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
import { ForecastCapacityService } from './application/services/forecast-capacity.service';

import { FORECAST_ASSIGNMENT_REPOSITORY } from './domain/repositories/forecast-assignment.repository';
import { FORECAST_TEAM_READER } from './application/ports/forecast-team-reader.port';
import { FORECAST_PROJECT_READER } from './application/ports/forecast-project-reader.port';
import { FORECAST_CLIENT_READER } from './application/ports/forecast-client-reader.port';
import { FORECAST_HOLIDAY_READER } from './application/ports/forecast-holiday-reader.port';

import { DrizzleForecastAssignmentRepository } from './infrastructure/persistence/drizzle-forecast-assignment.repository';
import { TeamsModuleForecastTeamReader } from './infrastructure/services/teams-module-forecast-team-reader';
import { ProjectsModuleForecastProjectReader } from './infrastructure/services/projects-module-forecast-project-reader';
import { ClientsModuleForecastClientReader } from './infrastructure/services/clients-module-forecast-client-reader';
import { DrizzleForecastHolidayReader } from './infrastructure/services/drizzle-forecast-holiday-reader';

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
    ForecastCapacityService,

    { provide: FORECAST_ASSIGNMENT_REPOSITORY, useClass: DrizzleForecastAssignmentRepository },
    { provide: FORECAST_TEAM_READER, useClass: TeamsModuleForecastTeamReader },
    { provide: FORECAST_PROJECT_READER, useClass: ProjectsModuleForecastProjectReader },
    { provide: FORECAST_CLIENT_READER, useClass: ClientsModuleForecastClientReader },
    { provide: FORECAST_HOLIDAY_READER, useClass: DrizzleForecastHolidayReader },
  ],
  /** `ForecastCapacityService` se exporta para que el panel (M7) reutilice el cálculo de capacidad sin encadenar casos de uso. */
  exports: [FORECAST_ASSIGNMENT_REPOSITORY, ForecastCapacityService],
})
export class ForecastModule {}
