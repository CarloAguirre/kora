import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import type { RequestPasswordResetInput } from '@kora/contracts';
import { Email } from '../../../users/domain/value-objects/email.vo';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/domain/repositories/user.repository';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../../../users/application/ports/invitation.port';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
} from '../../../../shared/application/ports/notification.port';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../../../../shared/application/ports/token.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface RequestPasswordResetCommand {
  readonly data: RequestPasswordResetInput;
  readonly ipAddress: string | null;
}

const RESET_TTL_HOURS = 2;

/**
 * Solicitud de recuperación de contraseña.
 *
 * SIEMPRE responde éxito, exista o no la cuenta. Si respondiera "ese correo no
 * está registrado" cualquiera podría averiguar quién trabaja en la empresa
 * probando direcciones. El coste de esa decisión es que quien se equivoca de
 * correo no recibe nada y no sabe por qué; se compensa diciéndolo en el texto
 * de la pantalla ("si el correo existe, recibirás un enlace").
 *
 * La ventana de validez es corta —dos horas, frente a las 72 de una invitación—
 * porque una recuperación se atiende en el momento.
 */
@Injectable()
export class RequestPasswordResetUseCase implements UseCase<RequestPasswordResetCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INVITATION_REPOSITORY) private readonly invitations: InvitationRepository,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly tokens: OpaqueTokenGenerator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<Result<void>> {
    const emailResult = Email.create(command.data.email);
    if (emailResult.isErr()) return ok(undefined);

    const user = await this.users.findByEmail(emailResult.value);
    if (!user || user.isDeleted || !user.canSignIn) return ok(undefined);

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + RESET_TTL_HOURS * 3_600_000);
    const token = this.tokens.generate();

    await this.invitations.invalidateAllForUser(user.id, now);
    await this.invitations.create({
      userId: user.id,
      tokenHash: token.hash,
      expiresAt,
      requestedIp: command.ipAddress,
    });

    await this.notifications.sendPasswordReset({
      email: user.email.value,
      firstName: user.name.firstName,
      resetToken: token.value,
      expiresAt,
    });

    await this.audit.record({
      actor: { userId: user.id, email: user.email.value, ipAddress: command.ipAddress },
      action: 'password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });

    return ok(undefined);
  }
}
