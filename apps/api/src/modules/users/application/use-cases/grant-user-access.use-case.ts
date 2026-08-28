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
import { UserNotFoundError } from '../../domain/errors/user.errors';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../domain/repositories/user-credential.repository';
import { INVITATION_REPOSITORY, type InvitationRepository } from '../ports/invitation.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
} from '../../../../shared/application/ports/notification.port';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../../../../shared/application/ports/token.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface GrantUserAccessCommand {
  readonly userId: string;
  readonly actor: ActorContext;
}

export interface GrantUserAccessResult {
  readonly invitationSent: boolean;
  readonly expiresAt: string;
}

const INVITATION_TTL_HOURS = 72;

/**
 * Concede acceso a un usuario que aún no lo tiene, o reenvía su invitación.
 *
 * Cubre el caso más común del sistema heredado: 55 de sus 58 usuarios existen
 * en la tabla `usuario` sin cuenta de acceso asociada, porque se cargaron como
 * fichas de personal antes de que existiera el login. Darles acceso es una
 * operación de negocio con nombre propio, no un efecto colateral de "editar
 * usuario".
 *
 * Emitir una invitación nueva invalida las anteriores, para que un enlace viejo
 * reenviado por correo no siga sirviendo.
 */
@Injectable()
export class GrantUserAccessUseCase
  implements UseCase<GrantUserAccessCommand, GrantUserAccessResult, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(INVITATION_REPOSITORY) private readonly invitations: InvitationRepository,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly tokens: OpaqueTokenGenerator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    command: GrantUserAccessCommand,
  ): Promise<Result<GrantUserAccessResult, ApplicationError>> {
    const { userId, actor } = command;

    const user = await this.users.findById(userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(userId));

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000);
    const token = this.tokens.generate();

    await this.unitOfWork.run(async (tx) => {
      await this.credentials.upsert(
        {
          userId: user.id,
          passwordHash: null,
          passwordAlgorithm: null,
          mustChangePassword: true,
        },
        tx,
      );

      await this.invitations.invalidateAllForUser(user.id, now, tx);
      await this.invitations.create(
        {
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
          requestedIp: actor.ipAddress ?? null,
        },
        tx,
      );
    });

    let invitationSent = false;
    try {
      await this.notifications.sendUserInvitation({
        email: user.email.value,
        firstName: user.name.firstName,
        invitedByName: actor.email,
        setPasswordToken: token.value,
        expiresAt,
      });
      invitationSent = true;
    } catch {
      invitationSent = false;
    }

    await this.audit.record({
      actor: {
        userId: actor.userId,
        email: actor.email,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
      },
      action: 'access_granted',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email.value, invitationSent },
    });

    return ok({ invitationSent, expiresAt: expiresAt.toISOString() });
  }
}
