import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, type Clock, type IdGenerator } from '@kora/core';
import type { AuthenticatedUser, Permission } from '@kora/contracts';
import type { User } from '../../../users/domain/entities/user.entity';
import {
  PERMISSION_READER,
  type PermissionReader,
} from '../../../users/application/ports/permission-reader.port';
import {
  LEADER_PROFILE_RESOLVER,
  type LeaderProfileResolver,
} from '../../../users/application/ports/leader-profile-resolver.port';
import {
  ACCESS_TOKEN_SERVICE,
  OPAQUE_TOKEN_GENERATOR,
  type AccessTokenService,
  type OpaqueTokenGenerator,
} from '../../../../shared/application/ports/token.port';
import { SESSION_REPOSITORY, type SessionRepository } from '../../../sessions/application/ports/session.repository';
import { AppConfigService } from '../../../../config/app-config.service';

export interface IssueSessionOptions {
  readonly mustChangePassword: boolean;
}

export interface LoginOutcome {
  readonly user: AuthenticatedUser;
  readonly sessionId: string;
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/**
 * Emisión de sesión, compartida por todo flujo que termina en "esta persona
 * quedó autenticada" — hoy el login por contraseña y el login con Google.
 *
 * Resuelve permisos y perfil de líder, abre la sesión, y firma los tokens.
 * Lo que NO hace es decidir si la persona puede entrar: eso (contraseña,
 * bloqueo de cuenta, verificación de Google) lo resuelve cada caso de uso
 * antes de llamar a `issue`.
 */
@Injectable()
export class SessionIssuerService {
  constructor(
    @Inject(PERMISSION_READER) private readonly permissions: PermissionReader,
    @Inject(LEADER_PROFILE_RESOLVER) private readonly leaderProfiles: LeaderProfileResolver,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly refreshTokens: OpaqueTokenGenerator,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly config: AppConfigService,
  ) {}

  async issue(
    user: User,
    ipAddress: string | null,
    userAgent: string | null,
    options: IssueSessionOptions,
  ): Promise<LoginOutcome> {
    const now = this.clock.now();
    const settings = this.config.auth;

    const [effective, leaderProfile] = await Promise.all([
      this.permissions.forUser(user.id),
      user.role === 'leader' ? this.leaderProfiles.resolve(user.id) : Promise.resolve(null),
    ]);

    const sessionId = this.ids.generate();
    const refreshToken = this.refreshTokens.generate();
    const refreshExpiresAt = new Date(now.getTime() + settings.refreshTtlDays * 86_400_000);

    await this.sessions.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: refreshToken.hash,
      expiresAt: refreshExpiresAt,
      userAgent,
      ipAddress,
    });

    const permissions = (effective?.permissions ?? []) as Permission[];
    const accessToken = await this.accessTokens.sign({
      sub: user.id,
      email: user.email.value,
      role: user.role,
      permissions,
      sid: sessionId,
    });

    return {
      sessionId,
      user: {
        id: user.id,
        email: user.email.value,
        firstName: user.name.firstName,
        lastName: user.name.lastName,
        fullName: user.name.fullName,
        role: user.role,
        status: user.status,
        permissions,
        teamId: user.teamId,
        leaderProfile,
        mustChangePassword: options.mustChangePassword,
      },
      accessToken: accessToken.token,
      expiresIn: accessToken.expiresInSeconds,
      refreshToken: refreshToken.value,
      refreshExpiresAt,
    };
  }
}
