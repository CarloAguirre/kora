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
import { LastAdministratorError, UserNotFoundError } from '../../domain/errors/user.errors';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import { SESSION_REVOKER, type SessionRevoker } from '../ports/session-revoker.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface DeleteUserCommand {
  readonly userId: string;
  readonly actor: ActorContext;
}

/**
 * Baja de un usuario (borrado lógico).
 *
 * Nunca se borra físicamente. Un usuario con cinco años de horas registradas,
 * tickets resueltos y participaciones en proyectos es el sujeto de miles de
 * filas históricas; eliminarlo de verdad obligaría a elegir entre romper esas
 * referencias o borrar el historial con él. La v1 resolvía esto con un trigger
 * `cleanup_on_usuario_delete` que iba desenganchando referencias a mano —una
 * pérdida de información silenciosa.
 *
 * Aquí la fila permanece, deja de aparecer en los listados y pierde el acceso.
 */
@Injectable()
export class DeleteUserUseCase implements UseCase<DeleteUserCommand, void, ApplicationError> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REVOKER) private readonly sessions: SessionRevoker,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteUserCommand): Promise<Result<void, ApplicationError>> {
    const { userId, actor } = command;

    const user = await this.users.findById(userId);
    if (!user) return err(new UserNotFoundError(userId));

    if (user.role === 'admin' || user.role === 'pmo') {
      const remaining = await this.users.countActiveAdminsExcluding(user.id);
      if (remaining === 0) return err(new LastAdministratorError());
    }

    const now = this.clock.now();
    const deletion = user.softDelete(actor.userId, now);
    if (deletion.isErr()) return err(deletion.error);

    await this.unitOfWork.run(async (tx) => {
      await this.users.save(user, actor.userId, tx);
      await this.sessions.revokeAllForUser(user.id, 'admin_revoked', now, tx);
    });

    await this.audit.record({
      actor: {
        userId: actor.userId,
        email: actor.email,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
      },
      action: 'delete',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email.value, role: user.role },
    });

    return ok(undefined);
  }
}
