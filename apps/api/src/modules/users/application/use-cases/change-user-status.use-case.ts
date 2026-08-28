import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { ChangeUserStatusInput } from '@kora/contracts';
import { LastAdministratorError, UserNotFoundError } from '../../domain/errors/user.errors';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../domain/repositories/user-credential.repository';
import {
  SESSION_REVOKER,
  type SessionRevoker,
} from '../ports/session-revoker.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
} from '../../../../shared/application/ports/notification.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface ChangeUserStatusCommand {
  readonly userId: string;
  readonly data: ChangeUserStatusInput;
  readonly actor: ActorContext;
}

/**
 * Habilita, deshabilita o desbloquea a un usuario.
 *
 * Lo importante aquí es el efecto inmediato: deshabilitar a alguien REVOCA sus
 * sesiones en el acto. En la v1 esto exigía una Edge Function aparte
 * (`force-signout-user`) que el front tenía que acordarse de llamar después de
 * actualizar el estado, con lo que un fallo de red dejaba a un usuario "dado de
 * baja" navegando con su sesión intacta. Ahora la revocación forma parte de la
 * misma transacción que el cambio de estado: no hay forma de hacer una sin la otra.
 */
@Injectable()
export class ChangeUserStatusUseCase
  implements UseCase<ChangeUserStatusCommand, void, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(SESSION_REVOKER) private readonly sessions: SessionRevoker,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeUserStatusCommand): Promise<Result<void, ApplicationError>> {
    const { userId, data, actor } = command;

    const user = await this.users.findById(userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(userId));

    const previousStatus = user.status;
    if (previousStatus === data.status) return ok(undefined);

    // Dejar el sistema sin ningún administrador activo lo deja sin nadie que
    // pueda arreglarlo: se comprueba antes de aplicar el cambio.
    if (data.status !== 'active' && (user.role === 'admin' || user.role === 'pmo')) {
      const remaining = await this.users.countActiveAdminsExcluding(user.id);
      if (remaining === 0) return err(new LastAdministratorError());
    }

    const now = this.clock.now();
    const transition = user.changeStatus(data.status, actor.userId, now);
    if (transition.isErr()) return err(transition.error);

    await this.unitOfWork.run(async (tx) => {
      await this.users.save(user, actor.userId, tx);

      if (data.status === 'active') {
        // Reactivar limpia el bloqueo por intentos fallidos; si no, la persona
        // quedaría "habilitada" pero sin poder entrar.
        await this.credentials.clearLock(user.id, tx);
      } else {
        await this.sessions.revokeAllForUser(user.id, 'status_changed', now, tx);
      }
    });

    await this.audit.record({
      actor: {
        userId: actor.userId,
        email: actor.email,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
      },
      action: 'status_change',
      entityType: 'user',
      entityId: user.id,
      changes: { status: { before: previousStatus, after: data.status } },
      ...(data.reason ? { metadata: { reason: data.reason } } : {}),
    });

    // Avisar es deseable, pero que falle el correo no debe revertir una baja.
    try {
      await this.notifications.sendAccountStatusChanged({
        email: user.email.value,
        firstName: user.name.firstName,
        status: data.status,
        reason: data.reason,
      });
    } catch {
      /* El estado ya está aplicado; el aviso es un extra. */
    }

    return ok(undefined);
  }
}
