import { Module } from '@nestjs/common';
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

import { TEAM_REPOSITORY } from './domain/repositories/team.repository';
import { TEAM_MEMBER_REPOSITORY } from './domain/repositories/team-member.repository';
import { TEAM_USER_READER } from './application/ports/team-user-reader.port';

import { DrizzleTeamRepository } from './infrastructure/persistence/drizzle-team.repository';
import { DrizzleTeamMemberRepository } from './infrastructure/persistence/drizzle-team-member.repository';
import { DrizzleTeamUserReader } from './infrastructure/persistence/drizzle-team-user-reader';

/**
 * Composición del módulo de equipos.
 *
 * Exporta `TEAM_REPOSITORY`: el módulo de usuarios lo consumirá para
 * satisfacer su propio puerto `TeamReader` en cuanto se recablee (ver
 * `UsersModule`), retirando el adaptador provisional que usa hoy.
 */
@Module({
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

    { provide: TEAM_REPOSITORY, useClass: DrizzleTeamRepository },
    { provide: TEAM_MEMBER_REPOSITORY, useClass: DrizzleTeamMemberRepository },
    { provide: TEAM_USER_READER, useClass: DrizzleTeamUserReader },
  ],
  exports: [TEAM_REPOSITORY, TEAM_MEMBER_REPOSITORY],
})
export class TeamsModule {}
