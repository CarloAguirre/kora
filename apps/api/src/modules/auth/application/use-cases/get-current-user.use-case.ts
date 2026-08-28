import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { AuthenticatedUser, Permission } from '@kora/contracts';
import { UserNotFoundError } from '../../../users/domain/errors/user.errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../../users/domain/repositories/user-credential.repository';
import {
  PERMISSION_READER,
  type PermissionReader,
} from '../../../users/application/ports/permission-reader.port';
import {
  LEADER_PROFILE_RESOLVER,
  type LeaderProfileResolver,
} from '../../../users/application/ports/leader-profile-resolver.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetCurrentUserCommand {
  readonly userId: string;
}

/**
 * Sesión actual: quién soy y qué puedo hacer.
 *
 * Lee de la base en lugar de reflejar el token, para que el front vea al
 * instante un cambio de rol o de equipo sin esperar a renovar. Es el endpoint
 * que el cliente consulta al arrancar y tras recuperar la conexión.
 */
@Injectable()
export class GetCurrentUserUseCase
  implements UseCase<GetCurrentUserCommand, AuthenticatedUser, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(PERMISSION_READER) private readonly permissions: PermissionReader,
    @Inject(LEADER_PROFILE_RESOLVER) private readonly leaderProfiles: LeaderProfileResolver,
  ) {}

  async execute(
    command: GetCurrentUserCommand,
  ): Promise<Result<AuthenticatedUser, ApplicationError>> {
    const user = await this.users.findById(command.userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(command.userId));

    const [effective, credential, leaderProfile] = await Promise.all([
      this.permissions.forUser(user.id),
      this.credentials.findByUserId(user.id),
      user.role === 'leader' ? this.leaderProfiles.resolve(user.id) : Promise.resolve(null),
    ]);

    return ok({
      id: user.id,
      email: user.email.value,
      firstName: user.name.firstName,
      lastName: user.name.lastName,
      fullName: user.name.fullName,
      role: user.role,
      status: user.status,
      permissions: (effective?.permissions ?? []) as Permission[],
      teamId: user.teamId,
      leaderProfile,
      mustChangePassword: credential?.mustChangePassword ?? false,
    });
  }
}
