import { Module } from '@nestjs/common';
import { HoursController } from './presentation/hours.controller';
import { HolidaysController } from './presentation/holidays.controller';

import { CreateHourEntryUseCase } from './application/use-cases/create-hour-entry.use-case';
import { UpdateHourEntryUseCase } from './application/use-cases/update-hour-entry.use-case';
import { ListHourEntriesUseCase } from './application/use-cases/list-hour-entries.use-case';
import { GetHourEntryUseCase } from './application/use-cases/get-hour-entry.use-case';
import { ApproveHourEntryUseCase } from './application/use-cases/approve-hour-entry.use-case';
import { RejectHourEntryUseCase } from './application/use-cases/reject-hour-entry.use-case';
import { DeleteHourEntryUseCase } from './application/use-cases/delete-hour-entry.use-case';
import { GetHoursCapacityReportUseCase } from './application/use-cases/get-hours-capacity-report.use-case';
import { GetHoursAvailabilityUseCase } from './application/use-cases/get-hours-availability.use-case';
import { GetProjectPendingApprovalsUseCase } from './application/use-cases/get-project-pending-approvals.use-case';
import { HourEntryApprovalAuthorityService } from './application/services/hour-entry-approval-authority.service';

import { HOUR_ENTRY_REPOSITORY } from './domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_USER_READER } from './application/ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER } from './application/ports/hour-entry-project-reader.port';
import { HOUR_ENTRY_TEAM_READER } from './application/ports/hour-entry-team-reader.port';
import { TICKET_HH_REQUEST_SYNC } from './application/ports/ticket-hh-request-sync.port';

import { DrizzleHourEntryRepository } from './infrastructure/persistence/drizzle-hour-entry.repository';
import { DrizzleHolidayReader } from './infrastructure/persistence/drizzle-holiday-reader';
import { UsersModuleHourEntryUserReader } from './infrastructure/services/users-module-hour-entry-user-reader';
import { ProjectsModuleHourEntryProjectReader } from './infrastructure/services/projects-module-hour-entry-project-reader';
import { TeamsModuleHourEntryTeamReader } from './infrastructure/services/teams-module-hour-entry-team-reader';
import { TicketsModuleTicketHhRequestSync } from './infrastructure/services/tickets-module-ticket-hh-request-sync';

import { UsersModule } from '../users/users.module';
import { ProjectsModule } from '../projects/projects.module';
import { TeamsModule } from '../teams/teams.module';

import { TICKET_HH_REQUEST_REPOSITORY } from '../tickets/domain/repositories/ticket-hh-request.repository';
import { TICKET_REPOSITORY } from '../tickets/domain/repositories/ticket.repository';
import { TICKET_HISTORY_REPOSITORY } from '../tickets/domain/repositories/ticket-history.repository';
import { DrizzleTicketHhRequestRepository } from '../tickets/infrastructure/persistence/drizzle-ticket-hh-request.repository';
import { DrizzleTicketRepository } from '../tickets/infrastructure/persistence/drizzle-ticket.repository';
import { DrizzleTicketHistoryRepository } from '../tickets/infrastructure/persistence/drizzle-ticket-history.repository';

/**
 * Composición de M4 (registro de horas).
 *
 * Los tres puertos de lectura cruzada (`HOUR_ENTRY_USER_READER`,
 * `HOUR_ENTRY_PROJECT_READER`, `HOUR_ENTRY_TEAM_READER`) apuntan a los módulos
 * reales desde el arranque — no hay adaptador nulo pendiente esta vez, porque
 * Usuarios, Proyectos y Equipos ya existían cuando se construyó M4.
 *
 * `TICKET_HH_REQUEST_SYNC` (ver el puerto) también apunta a Tickets, pero NO
 * se resuelve importando `TicketsModule`: ese módulo ya importa `HoursModule`
 * (por `HOUR_ENTRY_REPOSITORY`), así que importarlo de vuelta sería un ciclo.
 * En su lugar, este módulo registra sus propias instancias de los repositorios
 * Drizzle de Tickets que el adaptador necesita — mismas clases, mismo
 * `DATABASE` global, una segunda instancia de DI sin estado propio. Es la
 * única fisura al patrón de arriba, forzada por ese ciclo. Ver
 * docs/DECISION-M5-TICKETS.md.
 */
@Module({
  imports: [UsersModule, ProjectsModule, TeamsModule],
  controllers: [HoursController, HolidaysController],
  providers: [
    CreateHourEntryUseCase,
    UpdateHourEntryUseCase,
    ListHourEntriesUseCase,
    GetHourEntryUseCase,
    ApproveHourEntryUseCase,
    RejectHourEntryUseCase,
    DeleteHourEntryUseCase,
    GetHoursCapacityReportUseCase,
    GetHoursAvailabilityUseCase,
    GetProjectPendingApprovalsUseCase,
    HourEntryApprovalAuthorityService,
    DrizzleHolidayReader,

    { provide: HOUR_ENTRY_REPOSITORY, useClass: DrizzleHourEntryRepository },
    { provide: HOUR_ENTRY_USER_READER, useClass: UsersModuleHourEntryUserReader },
    { provide: HOUR_ENTRY_PROJECT_READER, useClass: ProjectsModuleHourEntryProjectReader },
    { provide: HOUR_ENTRY_TEAM_READER, useClass: TeamsModuleHourEntryTeamReader },

    { provide: TICKET_HH_REQUEST_REPOSITORY, useClass: DrizzleTicketHhRequestRepository },
    { provide: TICKET_REPOSITORY, useClass: DrizzleTicketRepository },
    { provide: TICKET_HISTORY_REPOSITORY, useClass: DrizzleTicketHistoryRepository },
    { provide: TICKET_HH_REQUEST_SYNC, useClass: TicketsModuleTicketHhRequestSync },
  ],
  /** `HOUR_ENTRY_TEAM_READER` se exporta además para que el panel (M7) resuelva el alcance de `hours:read_team` sin encadenar casos de uso. */
  exports: [HOUR_ENTRY_REPOSITORY, HOUR_ENTRY_TEAM_READER],
})
export class HoursModule {}
