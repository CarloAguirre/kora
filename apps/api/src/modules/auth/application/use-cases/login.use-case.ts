import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import { AUTH_ERROR_CODES, type LoginInput } from '@kora/contracts';
import { UnauthorizedError, ForbiddenError } from '@kora/core';
import { Email } from '../../../users/domain/value-objects/email.vo';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../../users/domain/repositories/user-credential.repository';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { AppConfigService } from '../../../../config/app-config.service';
import type { UseCase } from '../../../../shared/application/use-case';
import { SessionIssuerService, type LoginOutcome } from '../services/session-issuer.service';

export interface LoginCommand {
  readonly credentials: LoginInput;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

export type { LoginOutcome };

/**
 * Inicio de sesión.
 *
 * Decisiones que merecen explicación:
 *
 * 1. Ante credenciales incorrectas SIEMPRE se responde lo mismo, exista o no el
 *    usuario. Distinguir "no existe" de "contraseña incorrecta" convierte el
 *    login en un buscador de correos válidos.
 *
 * 2. Si la contraseña era correcta pero está guardada en bcrypt —el formato de
 *    Supabase— se regraba en argon2id en el acto. La migración de contraseñas
 *    ocurre sola, persona a persona, sin que nadie tenga que restablecer nada.
 *
 * 3. Los intentos fallidos se cuentan en la base y bloquean temporalmente la
 *    cuenta. El bloqueo caduca solo: no requiere que un administrador
 *    intervenga, que era el punto en el que la v1 dejaba a la gente atascada
 *    (`profiles.failed_attempts` se incrementaba pero nada lo limpiaba).
 */
@Injectable()
export class LoginUseCase implements UseCase<LoginCommand, LoginOutcome, ApplicationError> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessionIssuer: SessionIssuerService,
    private readonly config: AppConfigService,
  ) {}

  async execute(command: LoginCommand): Promise<Result<LoginOutcome, ApplicationError>> {
    const settings = this.config.auth;
    const now = this.clock.now();

    const emailResult = Email.create(command.credentials.email);
    if (emailResult.isErr()) return err(invalidCredentials());
    const email = emailResult.value;

    if (!email.belongsToAnyDomain(settings.allowedEmailDomains)) {
      return err(
        new ForbiddenError(
          'Este correo no pertenece a un dominio autorizado.',
          AUTH_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED,
        ),
      );
    }

    const user = await this.users.findByEmail(email);
    if (!user || user.isDeleted) {
      await this.recordFailure(command, null, email.value, 'unknown_user');
      return err(invalidCredentials());
    }

    const credential = await this.credentials.findByUserId(user.id);
    if (!credential || !credential.passwordHash || !credential.passwordAlgorithm) {
      // La cuenta existe como ficha de personal pero nunca se le dio acceso.
      // Es un caso distinto de "contraseña incorrecta" y conviene decirlo: no
      // filtra nada que el interesado no sepa ya, y evita soporte innecesario.
      await this.recordFailure(command, user.id, email.value, 'no_access_granted');
      return err(
        new UnauthorizedError(
          'Esta cuenta aún no tiene acceso habilitado. Solicita una invitación a un administrador.',
          AUTH_ERROR_CODES.NO_ACCESS_GRANTED,
        ),
      );
    }

    if (credential.lockedUntil && credential.lockedUntil > now) {
      const minutes = Math.ceil((credential.lockedUntil.getTime() - now.getTime()) / 60_000);
      return err(
        new UnauthorizedError(
          `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutes} minuto(s).`,
          AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        ),
      );
    }

    const verification = await this.hasher.verify(
      command.credentials.password,
      credential.passwordHash,
      credential.passwordAlgorithm,
    );

    if (!verification.valid) {
      const attempts = await this.credentials.registerFailedAttempt(user.id);
      if (attempts >= settings.maxFailedAttempts) {
        await this.credentials.lockUntil(
          user.id,
          new Date(now.getTime() + settings.lockMinutes * 60_000),
        );
      }
      await this.recordFailure(command, user.id, email.value, 'bad_password', attempts);
      return err(invalidCredentials());
    }

    // La contraseña es correcta. El estado de la cuenta se comprueba DESPUÉS,
    // para no revelar por el mensaje de error si una cuenta está deshabilitada
    // a quien no conoce su contraseña.
    if (!user.canSignIn) {
      const code =
        user.status === 'blocked'
          ? AUTH_ERROR_CODES.ACCOUNT_BLOCKED
          : AUTH_ERROR_CODES.ACCOUNT_DISABLED;
      const message =
        user.status === 'blocked'
          ? 'Tu cuenta está bloqueada. Contacta a un administrador.'
          : 'Tu cuenta está deshabilitada. Contacta a un administrador.';
      return err(new ForbiddenError(message, code));
    }

    if (verification.needsRehash) {
      // Migración transparente del hash. Si falla, el login continúa: la
      // persona ya demostró su identidad y no tiene por qué pagar un problema
      // interno de mantenimiento.
      try {
        const rehashed = await this.hasher.hash(command.credentials.password);
        await this.credentials.updatePassword(
          user.id,
          rehashed,
          this.hasher.currentAlgorithm,
          credential.mustChangePassword,
          now,
        );
      } catch {
        /* Se reintentará en el próximo inicio de sesión. */
      }
    }

    await this.credentials.registerSuccessfulLogin(user.id, now);

    const outcome = await this.sessionIssuer.issue(user, command.ipAddress, command.userAgent, {
      mustChangePassword: credential.mustChangePassword,
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
      metadata: { sessionId: outcome.sessionId, method: 'password' },
    });

    return ok(outcome);
  }

  private async recordFailure(
    command: LoginCommand,
    userId: string | null,
    email: string,
    reason: string,
    attempts?: number,
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
      metadata: { reason, ...(attempts !== undefined ? { attempts } : {}) },
    });
  }
}

/** Un único error para todos los fallos de credenciales, a propósito. */
function invalidCredentials(): UnauthorizedError {
  return new UnauthorizedError(
    'Correo o contraseña incorrectos.',
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
  );
}
