import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { UserDetail } from '@kora/contracts';
import { UserNotFoundError } from '../../domain/errors/user.errors';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../domain/repositories/user-credential.repository';
import { TEAM_READER, type TeamReader } from '../ports/team-reader.port';
import {
  LEADER_PROFILE_RESOLVER,
  type LeaderProfileResolver,
} from '../ports/leader-profile-resolver.port';
import {
  PERMISSION_READER,
  type PermissionReader,
} from '../ports/permission-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toUserDetail } from '../mappers/user.mapper';

export interface GetUserCommand {
  readonly userId: string;
}

/** Ficha completa de un usuario, con permisos efectivos y estado de su cuenta. */
@Injectable()
export class GetUserUseCase implements UseCase<GetUserCommand, UserDetail, ApplicationError> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(TEAM_READER) private readonly teams: TeamReader,
    @Inject(LEADER_PROFILE_RESOLVER) private readonly leaderProfiles: LeaderProfileResolver,
    @Inject(PERMISSION_READER) private readonly permissions: PermissionReader,
  ) {}

  async execute(command: GetUserCommand): Promise<Result<UserDetail, ApplicationError>> {
    const user = await this.users.findById(command.userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(command.userId));

    // Las cuatro lecturas son independientes: en paralelo cuestan lo que la más
    // lenta, en serie lo que la suma.
    const [team, credentials, leaderProfile, effective] = await Promise.all([
      user.teamId ? this.teams.findById(user.teamId) : Promise.resolve(null),
      this.credentials.findByUserId(user.id),
      user.role === 'leader' ? this.leaderProfiles.resolve(user.id) : Promise.resolve(null),
      this.permissions.forUser(user.id),
    ]);

    return ok(
      toUserDetail({
        user,
        teamName: team?.name ?? null,
        credentials,
        permissions: effective?.permissions ?? [],
        leaderProfile,
      }),
    );
  }
}
