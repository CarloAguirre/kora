import { Inject, Injectable } from '@nestjs/common';
import { err, ok, UnauthorizedError, ForbiddenError, type ApplicationError, type Result } from '@kora/core';
import { AUTH_ERROR_CODES } from '@kora/contracts';
import { Email } from '../../../users/domain/value-objects/email.vo';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  GOOGLE_OAUTH_CLIENT,
  type GoogleOAuthClient,
} from '../../../../shared/application/ports/google-oauth-client.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { AppConfigService } from '../../../../config/app-config.service';
import type { UseCase } from '../../../../shared/application/use-case';
import { SessionIssuerService, type LoginOutcome } from '../services/session-issuer.service';

export interface GoogleLoginCommand {
  readonly code: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

/**
 * Inicio de sesión con Google.
 *
 * A diferencia de `LoginUseCase`, aquí no hay contraseña que verificar: Google
 * ya demostró que la persona controla el correo. Por eso, a diferencia del
 * login por contraseña, SÍ es correcto decir explícitamente "no existe cuenta"
 * — no hay enumeración que proteger cuando el correo ya viene confirmado por
 * un tercero de confianza.
 *
 * No crea usuarios nuevos: Google es un método de acceso alternativo para una
 * cuenta que un administrador ya dio de alta, igual que la contraseña.
 */
@Injectable()
export class GoogleLoginUseCase
  implements UseCase<GoogleLoginCommand, LoginOutcome, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(GOOGLE_OAUTH_CLIENT) private readonly googleClient: GoogleOAuthClient,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly sessionIssuer: SessionIssuerService,
    private readonly config: AppConfigService,
  ) {}

  async execute(command: GoogleLoginCommand): Promise<Result<LoginOutcome, ApplicationError>> {
    let profile;
    try {
      profile = await this.googleClient.fetchProfile(command.code);
    } catch {
      return err(
        new UnauthorizedError(
          'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.',
          AUTH_ERROR_CODES.GOOGLE_LOGIN_FAILED,
        ),
      );
    }

    if (!profile.emailVerified) {
      return err(
        new UnauthorizedError(
          'Tu cuenta de Google no tiene el correo verificado.',
          AUTH_ERROR_CODES.GOOGLE_EMAIL_NOT_VERIFIED,
        ),
      );
    }

    const emailResult = Email.create(profile.email);
    if (emailResult.isErr()) {
      return err(
        new UnauthorizedError(
          'No se pudo completar el inicio de sesión con Google.',
          AUTH_ERROR_CODES.GOOGLE_LOGIN_FAILED,
        ),
      );
    }
    const email = emailResult.value;

    if (!email.belongsToAnyDomain(this.config.auth.allowedEmailDomains)) {
      await this.recordFailure(command, null, email.value, 'domain_not_allowed');
      return err(
        new ForbiddenError(
          'Este correo no pertenece a un dominio autorizado.',
          AUTH_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED,
        ),
      );
    }

    const user = await this.users.findByEmail(email);
    if (!user || user.isDeleted) {
      await this.recordFailure(command, null, email.value, 'no_account');
      return err(
        new UnauthorizedError(
          'No existe una cuenta de Kora asociada a este correo. Contacta a un administrador.',
          AUTH_ERROR_CODES.GOOGLE_ACCOUNT_NOT_FOUND,
        ),
      );
    }

    if (!user.canSignIn) {
      const code =
        user.status === 'blocked'
          ? AUTH_ERROR_CODES.ACCOUNT_BLOCKED
          : AUTH_ERROR_CODES.ACCOUNT_DISABLED;
      const message =
        user.status === 'blocked'
          ? 'Tu cuenta está bloqueada. Contacta a un administrador.'
          : 'Tu cuenta está deshabilitada. Contacta a un administrador.';
      await this.recordFailure(command, user.id, email.value, 'account_not_signinable');
      return err(new ForbiddenError(message, code));
    }

    const outcome = await this.sessionIssuer.issue(user, command.ipAddress, command.userAgent, {
      mustChangePassword: false,
    });

    await this.audit.record({
      actor: {
        userId: user.id,
        email: user.email.value,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        requestId: command.requestId,
      },
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      metadata: { sessionId: outcome.sessionId, method: 'google' },
    });

    return ok(outcome);
  }

  private async recordFailure(
    command: GoogleLoginCommand,
    userId: string | null,
    email: string,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      actor: {
        userId,
        email,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        requestId: command.requestId,
      },
      action: 'login_failed',
      entityType: 'user',
      entityId: userId,
      metadata: { reason, method: 'google' },
    });
  }
}
