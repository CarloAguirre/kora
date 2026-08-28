import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  UNIT_OF_WORK,
  UnauthorizedError,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import { AUTH_ERROR_CODES, type Permission } from '@kora/contracts';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  PERMISSION_READER,
  type PermissionReader,
} from '../../../users/application/ports/permission-reader.port';
import {
  ACCESS_TOKEN_SERVICE,
  OPAQUE_TOKEN_GENERATOR,
  type AccessTokenService,
  type OpaqueTokenGenerator,
} from '../../../../shared/application/ports/token.port';
import { SESSION_REPOSITORY, type SessionRepository } from '../../../sessions/application/ports/session.repository';
import { AppConfigService } from '../../../../config/app-config.service';
import type { UseCase } from '../../../../shared/application/use-case';

export interface RefreshSessionCommand {
  readonly refreshToken: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface RefreshSessionOutcome {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/**
 * Renueva la sesión rotando el refresh token.
 *
 * Cada uso emite un token nuevo e invalida el anterior. Eso permite detectar el
 * robo: si alguien intenta usar un token ya rotado, o el legítimo o el ladrón
 * está usando una copia, y lo prudente es cerrar TODAS las sesiones de esa
 * persona y obligar a un login nuevo. Es la práctica estándar de detección de
 * reutilización, y es la razón por la que se guarda `rotated_from_id`.
 *
 * Además, la renovación recalcula los permisos: un cambio de rol se propaga en
 * cuanto el cliente renueva, sin esperar a que cierre sesión.
 */
@Injectable()
export class RefreshSessionUseCase
  implements UseCase<RefreshSessionCommand, RefreshSessionOutcome, ApplicationError>
{
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PERMISSION_READER) private readonly permissions: PermissionReader,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly refreshTokens: OpaqueTokenGenerator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly config: AppConfigService,
  ) {}

  async execute(
    command: RefreshSessionCommand,
  ): Promise<Result<RefreshSessionOutcome, ApplicationError>> {
    const now = this.clock.now();
    const hash = this.refreshTokens.hash(command.refreshToken);

    const session = await this.sessions.findByRefreshTokenHash(hash);
    if (!session) return err(invalidRefreshToken());

    if (session.revokedAt) {
      // Reutilización de un token ya rotado: se asume compromiso y se cierra
      // todo. Es preferible molestar a alguien con un login extra que dejar
      // viva una sesión robada.
      if (session.revokedReason === 'rotated') {
        await this.sessions.revokeAllForUser(session.userId, 'admin_revoked', now);
      }
      return err(invalidRefreshToken());
    }

    if (session.expiresAt <= now) return err(invalidRefreshToken());

    const user = await this.users.findById(session.userId);
    if (!user || !user.canSignIn) {
      await this.sessions.revokeAllForUser(session.userId, 'status_changed', now);
      return err(
        new UnauthorizedError(
          'La cuenta ya no tiene acceso al sistema.',
          AUTH_ERROR_CODES.ACCOUNT_DISABLED,
        ),
      );
    }

    const settings = this.config.auth;
    const newSessionId = this.ids.generate();
    const newRefreshToken = this.refreshTokens.generate();
    const refreshExpiresAt = new Date(now.getTime() + settings.refreshTtlDays * 86_400_000);

    // Revocar la vieja y crear la nueva deben ocurrir juntas: si se cayera en
    // medio, o quedarían dos sesiones válidas o ninguna.
    await this.unitOfWork.run(async (tx) => {
      await this.sessions.revokeById(session.id, 'rotated', now, tx);
      await this.sessions.create(
        {
          id: newSessionId,
          userId: user.id,
          refreshTokenHash: newRefreshToken.hash,
          expiresAt: refreshExpiresAt,
          userAgent: command.userAgent,
          ipAddress: command.ipAddress,
          rotatedFromId: session.id,
        },
        tx,
      );
    });

    const effective = await this.permissions.forUser(user.id);
    const accessToken = await this.accessTokens.sign({
      sub: user.id,
      email: user.email.value,
      role: user.role,
      permissions: (effective?.permissions ?? []) as Permission[],
      sid: newSessionId,
    });

    return ok({
      accessToken: accessToken.token,
      expiresIn: accessToken.expiresInSeconds,
      refreshToken: newRefreshToken.value,
      refreshExpiresAt,
    });
  }
}

function invalidRefreshToken(): UnauthorizedError {
  return new UnauthorizedError(
    'La sesión expiró. Inicia sesión de nuevo.',
    AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
  );
}
