import { Module } from '@nestjs/common';
import { UsersController } from './presentation/users.controller';

// Casos de uso
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { ChangeUserStatusUseCase } from './application/use-cases/change-user-status.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { GrantUserAccessUseCase } from './application/use-cases/grant-user-access.use-case';

// Puertos
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { USER_CREDENTIAL_REPOSITORY } from './domain/repositories/user-credential.repository';
import { TEAM_READER } from './application/ports/team-reader.port';
import { INVITATION_REPOSITORY } from './application/ports/invitation.port';
import { PERMISSION_READER } from './application/ports/permission-reader.port';
import { LEADER_PROFILE_RESOLVER } from './application/ports/leader-profile-resolver.port';

// Adaptadores
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { DrizzleUserCredentialRepository } from './infrastructure/persistence/drizzle-user-credential.repository';
import { TeamsModuleTeamReader } from './infrastructure/persistence/teams-module-team-reader';
import { TeamsModule } from '../teams/teams.module';
import { DrizzleInvitationRepository } from './infrastructure/persistence/drizzle-invitation.repository';
import { DrizzlePermissionReader } from './infrastructure/persistence/drizzle-permission-reader';
import { AssignmentLeaderProfileResolver } from './infrastructure/services/assignment-leader-profile.resolver';
import { RoleCatalog } from './infrastructure/persistence/role-catalog';

/**
 * Composición del módulo de usuarios.
 *
 * Este archivo es el ÚNICO lugar donde una abstracción se ata a su
 * implementación. Los casos de uso piden `USER_REPOSITORY`; que detrás haya
 * Drizzle se decide aquí. Un test sustituye este mapeo por dobles en memoria
 * sin tocar nada más, y una migración de ORM se resuelve cambiando la clase
 * indicada en `useClass`.
 */
@Module({
  imports: [TeamsModule],
  controllers: [UsersController],
  providers: [
    CreateUserUseCase,
    UpdateUserUseCase,
    ListUsersUseCase,
    GetUserUseCase,
    ChangeUserStatusUseCase,
    DeleteUserUseCase,
    GrantUserAccessUseCase,

    RoleCatalog,

    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: USER_CREDENTIAL_REPOSITORY, useClass: DrizzleUserCredentialRepository },
    { provide: TEAM_READER, useClass: TeamsModuleTeamReader },
    { provide: INVITATION_REPOSITORY, useClass: DrizzleInvitationRepository },
    { provide: PERMISSION_READER, useClass: DrizzlePermissionReader },
    { provide: LEADER_PROFILE_RESOLVER, useClass: AssignmentLeaderProfileResolver },
  ],
  // Se exportan solo los puertos que otros módulos necesitan (autenticación
  // consulta usuarios, credenciales y permisos). Los casos de uso NO se
  // exportan: quien quiera operar sobre usuarios lo hace por HTTP o pidiendo
  // aquí un caso de uso nuevo, no llamando por dentro a los ajenos.
  exports: [USER_REPOSITORY, USER_CREDENTIAL_REPOSITORY, PERMISSION_READER, INVITATION_REPOSITORY],
})
export class UsersModule {}
