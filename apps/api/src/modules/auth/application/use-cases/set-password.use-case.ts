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
import { passwordSchema, type ConfirmPasswordResetInput } from '@kora/contracts';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../../users/domain/repositories/user-credential.repository';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../../../users/application/ports/invitation.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../../../../shared/application/ports/token.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { SESSION_REPOSITORY, type SessionRepository } from '../../../sessions/application/ports/session.repository';
import { ValidationError } from '@kora/core';
import type { UseCase } from '../../../../shared/application/use-case';

export interface SetPasswordCommand {
  readonly data: ConfirmPasswordResetInput;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/**
 * Fija la contraseña a partir de un token de invitación o de recuperación.
 *
 * Cubre los dos flujos con un solo caso de uso porque son el mismo acto: alguien
 * demuestra tener acceso al correo y elige una contraseña. Al terminar se
 * revocan todas las sesiones anteriores, que es lo que se espera de una
 * recuperación: si la contraseña se cambió porque alguien más la tenía, esa
 * persona debe quedar fuera de inmediato.
 */
@Injectable()
export class SetPasswordUseCase implements UseCase<SetPasswordCommand, void, ApplicationError> {
  constructor(
    @Inject(INVITATION_REPOSITORY) private readonly invitations: InvitationRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly tokens: OpaqueTokenGenerator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetPasswordCommand): Promise<Result<void, ApplicationError>> {
    const parsed = passwordSchema.safeParse(command.data.newPassword);
    if (!parsed.success) {
      return err(
        new ValidationError(
          parsed.error.issues[0]?.message ?? 'La contraseña no cumple la política.',
          'WEAK_PASSWORD',
        ),
      );
    }

    const now = this.clock.now();
    const tokenHash = this.tokens.hash(command.data.token);
    const invitation = await this.invitations.findByTokenHash(tokenHash);

    // "No existe", "ya se usó" y "expiró" comparten respuesta: quien tenga un
    // token inválido no debe poder deducir cuál de los tres casos es.
    if (!invitation || invitation.usedAt || invitation.expiresAt <= now) {
      return err(
        new UnauthorizedError(
          'El enlace no es válido o ya expiró. Solicita uno nuevo.',
          'INVALID_OR_EXPIRED_TOKEN',
        ),
      );
    }

    const user = await this.users.findById(invitation.userId);
    if (!user || user.isDeleted) {
      return err(
        new UnauthorizedError('El enlace no es válido o ya expiró.', 'INVALID_OR_EXPIRED_TOKEN'),
      );
    }

    const passwordHash = await this.hasher.hash(command.data.newPassword);

    await this.unitOfWork.run(async (tx) => {
      await this.credentials.upsert(
        {
          userId: user.id,
          passwordHash,
          passwordAlgorithm: this.hasher.currentAlgorithm,
          mustChangePassword: false,
          // Haber recibido el enlace prueba el control del buzón.
          emailVerifiedAt: now,
        },
        tx,
      );
      await this.invitations.markAsUsed(invitation.id, now, tx);
      await this.sessions.revokeAllForUser(user.id, 'password_changed', now, tx);
    });

    await this.audit.record({
      actor: {
        userId: user.id,
        email: user.email.value,
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
      },
      action: 'password_reset_completed',
      entityType: 'user',
      entityId: user.id,
    });

    return ok(undefined);
  }
}
