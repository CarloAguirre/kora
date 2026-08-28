import { Module } from '@nestjs/common';
import { HoursModule } from '../hours/hours.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ProjectsModule } from '../projects/projects.module';
import { ForecastModule } from '../forecast/forecast.module';
import { TeamsModule } from '../teams/teams.module';
import { DashboardController } from './presentation/dashboard.controller';
import { GetDashboardSummaryUseCase } from './application/use-cases/get-dashboard-summary.use-case';

/**
 * M7 — ver docs/DECISION-M7-DASHBOARD.md. Sin dominio ni persistencia
 * propios: agrega, reutilizando los casos de uso de los módulos dueños de
 * cada dato, en vez de duplicar sus reglas.
 */
@Module({
  imports: [HoursModule, TicketsModule, ProjectsModule, ForecastModule, TeamsModule],
  controllers: [DashboardController],
  providers: [GetDashboardSummaryUseCase],
})
export class DashboardModule {}
