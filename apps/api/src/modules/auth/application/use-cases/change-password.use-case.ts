import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  UnauthorizedError,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import { AUTH_ERROR_CODES, type ChangePasswordInput } from '@kora/contracts';
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
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { SESSION_REPOSITORY, type SessionRepository } from '../../../sessions/application/ports/session.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface ChangePasswordCommand {
  readonly userId: string;
  /** Sesión desde la que se ejecuta el cambio. Se registra en la auditoría. */
  readonly currentSessionId: string;
  readonly data: ChangePasswordInput;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Cambio de contraseña por parte del propio usuario.
 *
 * Exige la contraseña actual: sin eso, quien se siente ante una sesión abierta
 * puede apropiarse de la cuenta. Tras el cambio se cierran todas las
 * sesiones, incluida la que ejecutó la operación: hay que volver a entrar una
 * vez, y no queda ninguna sesión emitida bajo la contraseña anterior.
 */
@Injectable()
export class ChangePasswordUseCase
  implements UseCase<ChangePasswordCommand, void, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<Result<void, ApplicationError>> {
    const user = await this.users.findById(command.userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(command.userId));

    const credential = await this.credentials.findByUserId(user.id);
    if (!credential?.passwordHash || !credential.passwordAlgorithm) {
      return err(
        new UnauthorizedError(
          'Esta cuenta no tiene una contraseña definida.',
          AUTH_ERROR_CODES.NO_ACCESS_GRANTED,
        ),
      );
    }

    const verification = await this.hasher.verify(
      command.data.currentPassword,
      credential.passwordHash,
      credential.passwordAlgorithm,
    );

    if (!verification.valid) {
      return err(
        new UnauthorizedError(
          'La contraseña actual no es correcta.',
          AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        ),
      );
    }

    const now = this.clock.now();
    const passwordHash = await this.hasher.hash(command.data.newPassword);

    await this.unitOfWork.run(async (tx) => {
      await this.credentials.updatePassword(
        user.id,
        passwordHash,
        this.hasher.currentAlgorithm,
        false,
        now,
        tx,
      );

      // Se revocan TODAS las sesiones, incluida la actual: quien cambia su
      // contraseña vuelve a iniciar sesión una vez, y a cambio no queda ninguna
      // sesión viva emitida con la contraseña anterior. Conservar la actual
      // obligaría a distinguirla por el identificador que trae el token, y un
      // error ahí dejaría abierta justo la sesión que se quería cerrar.
      await this.sessions.revokeAllForUser(user.id, 'password_changed', now, tx);
    });

    await this.audit.record({
      actor: {
        userId: user.id,
        email: user.email.value,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
      },
      action: 'password_change',
      entityType: 'user',
      entityId: user.id,
      metadata: { fromSessionId: command.currentSessionId },
    });

    return ok(undefined);
  }
}
