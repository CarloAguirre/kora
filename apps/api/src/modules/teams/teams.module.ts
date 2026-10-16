import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamsController } from './presentation/teams.controller';

import { CreateTeamUseCase } from './application/use-cases/create-team.use-case';
import { UpdateTeamUseCase } from './application/use-cases/update-team.use-case';
import { ListTeamsUseCase } from './application/use-cases/list-teams.use-case';
import { GetTeamUseCase } from './application/use-cases/get-team.use-case';
import { GetTeamAvailabilityUseCase } from './application/use-cases/get-team-availability.use-case';
import { DeleteTeamUseCase } from './application/use-cases/delete-team.use-case';
import { AddTeamMemberUseCase } from './application/use-cases/add-team-member.use-case';
import { RemoveTeamMemberUseCase } from './application/use-cases/remove-team-member.use-case';
import { UpdateTeamMemberUseCase } from './application/use-cases/update-team-member.use-case';
import { ListTeamMemberOptionsUseCase } from './application/use-cases/list-team-member-options.use-case';
import { ListTeamTypesUseCase } from './application/use-cases/list-team-types.use-case';
import { CreateTeamTypeUseCase } from './application/use-cases/create-team-type.use-case';
import { GetTeamReportUseCase } from './application/use-cases/get-team-report.use-case';
import { UpdateTeamReportCommentUseCase } from './application/use-cases/update-team-report-comment.use-case';
import { RequestTeamReportDataUseCase } from './application/use-cases/request-team-report-data.use-case';

import { TEAM_REPOSITORY } from './domain/repositories/team.repository';
import { TEAM_MEMBER_REPOSITORY } from './domain/repositories/team-member.repository';
import { TEAM_TYPE_REPOSITORY } from './domain/repositories/team-type.repository';
import { TEAM_USER_READER } from './application/ports/team-user-reader.port';
import { TEAM_REPORT_READER } from './application/ports/team-report-reader.port';

import { DrizzleTeamRepository } from './infrastructure/persistence/drizzle-team.repository';
import { DrizzleTeamMemberRepository } from './infrastructure/persistence/drizzle-team-member.repository';
import { DrizzleTeamTypeRepository } from './infrastructure/persistence/drizzle-team-type.repository';
import { DrizzleTeamUserReader } from './infrastructure/persistence/drizzle-team-user-reader';
import { DrizzleTeamReportReader } from './infrastructure/persistence/drizzle-team-report-reader';

/**
 * Composición del módulo de equipos.
 *
 * Exporta `TEAM_REPOSITORY`: el módulo de usuarios lo consumirá para
 * satisfacer su propio puerto `TeamReader` en cuanto se recablee (ver
 * `UsersModule`), retirando el adaptador provisional que usa hoy.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [TeamsController],
  providers: [
    CreateTeamUseCase,
    UpdateTeamUseCase,
    ListTeamsUseCase,
    GetTeamUseCase,
    GetTeamAvailabilityUseCase,
    DeleteTeamUseCase,
    AddTeamMemberUseCase,
    RemoveTeamMemberUseCase,
    UpdateTeamMemberUseCase,
    ListTeamMemberOptionsUseCase,
    ListTeamTypesUseCase,
    CreateTeamTypeUseCase,
    GetTeamReportUseCase,
    UpdateTeamReportCommentUseCase,
    RequestTeamReportDataUseCase,

    { provide: TEAM_REPOSITORY, useClass: DrizzleTeamRepository },
    { provide: TEAM_MEMBER_REPOSITORY, useClass: DrizzleTeamMemberRepository },
    { provide: TEAM_TYPE_REPOSITORY, useClass: DrizzleTeamTypeRepository },
    { provide: TEAM_USER_READER, useClass: DrizzleTeamUserReader },
    { provide: TEAM_REPORT_READER, useClass: DrizzleTeamReportReader },
  ],
  exports: [TEAM_REPOSITORY, TEAM_MEMBER_REPOSITORY],
})
export class TeamsModule {}
