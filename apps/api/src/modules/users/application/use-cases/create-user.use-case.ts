import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { CreateUserInput, RoleCode } from '@kora/contracts';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';
import {
  EmailAlreadyInUseError,
  TeamNotFoundError,
} from '../../domain/errors/user.errors';
import { TeamAssignmentPolicy } from '../../domain/services/team-assignment.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  USER_CREDENTIAL_REPOSITORY,
  type UserCredentialRepository,
} from '../../domain/repositories/user-credential.repository';
import { TEAM_READER, type TeamReader } from '../ports/team-reader.port';
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
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from '../ports/invitation.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';

export interface CreateUserCommand {
  readonly data: CreateUserInput;
  readonly actor: ActorContext;
}

export interface CreateUserResult {
  readonly userId: string;
  readonly email: string;
  readonly invitationSent: boolean;
}

/** Validez de la invitación para fijar la primera contraseña. */
const INVITATION_TTL_HOURS = 72;

/**
 * Alta de un usuario.
 *
 * Reemplaza a la Edge Function `provision-user-access` de la v1 (2.249 líneas
 * en un solo archivo, más una función PL/pgSQL `create_user_access_atomic`, más
 * una tabla de "reconciliation holds" para los casos en que la creación quedaba
 * a medias). Toda esa maquinaria existía porque había DOS sistemas que
 * sincronizar —`auth.users` de Supabase y las tablas de la aplicación— sin una
 * transacción que los abarcara.
 *
 * Aquí no hay dos sistemas: el usuario y su credencial viven en la misma base,
 * se escriben en la misma transacción y, si algo falla, Postgres deshace todo.
 * No hay estado intermedio que reconciliar, así que no hace falta reconciliar.
 */
@Injectable()
export class CreateUserUseCase
  implements UseCase<CreateUserCommand, CreateUserResult, ApplicationError>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(USER_CREDENTIAL_REPOSITORY) private readonly credentials: UserCredentialRepository,
    @Inject(TEAM_READER) private readonly teams: TeamReader,
    @Inject(INVITATION_REPOSITORY) private readonly invitations: InvitationRepository,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(OPAQUE_TOKEN_GENERATOR) private readonly tokens: OpaqueTokenGenerator,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateUserCommand): Promise<Result<CreateUserResult, ApplicationError>> {
    const { data, actor } = command;

    // 1. Los value objects validan formato y normalizan. A partir de aquí,
    //    ningún dato malformado puede circular.
    const emailResult = Email.create(data.email);
    if (emailResult.isErr()) return err(emailResult.error);
    const email = emailResult.value;

    const nameResult = PersonName.create(data.firstName, data.lastName);
    if (nameResult.isErr()) return err(nameResult.error);
    const name = nameResult.value;

    // 2. Reglas de negocio previas a tocar la base.
    const teamId = TeamAssignmentPolicy.normalizeTeamForRole(data.role, data.teamId ?? null);
    const teamPolicy = TeamAssignmentPolicy.validate(data.role, teamId);
    if (teamPolicy.isErr()) return err(teamPolicy.error);

    if (teamId) {
      const team = await this.teams.findById(teamId);
      if (!team) return err(new TeamNotFoundError(teamId));
    }

    // 3. Unicidad del correo. La comprobación aquí da un mensaje claro; el
    //    índice único de la base es la garantía real ante dos altas simultáneas.
    if (await this.users.emailIsTakenByAnother(email, null)) {
      return err(new EmailAlreadyInUseError(email.value));
    }

    const now = this.clock.now();
    const user = User.create({
      id: this.ids.generate(),
      email,
      name,
      role: data.role as RoleCode,
      teamId,
      isCommercialManager: data.isCommercialManager,
      now,
    });

    const invitationToken = data.grantAccess ? this.tokens.generate() : null;
    const invitationExpiresAt = new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000);

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.users.save(user, actor.userId, tx);

        if (data.grantAccess && invitationToken) {
          // El usuario nace SIN contraseña: se la fija él con el enlace de la
          // invitación. Así ninguna contraseña inicial viaja por correo ni la
          // conoce quien da el alta.
          await this.credentials.upsert(
            {
              userId: user.id,
              passwordHash: null,
              passwordAlgorithm: null,
              mustChangePassword: true,
            },
            tx,
          );

          await this.invitations.create(
            {
              userId: user.id,
              tokenHash: invitationToken.hash,
              expiresAt: invitationExpiresAt,
              requestedIp: actor.ipAddress ?? null,
            },
            tx,
          );
        }
      });
    } catch (error) {
      // La unicidad la puede hacer saltar una carrera entre dos altas: se
      // traduce al error de negocio en vez de dejar escapar un 500.
      if (isUniqueViolation(error)) {
        return err(new EmailAlreadyInUseError(email.value));
      }
      throw error;
    }

    // 4. Efectos externos DESPUÉS del commit: si el correo falla, el usuario ya
    //    está creado y se le puede reenviar la invitación. Al revés —enviar
    //    dentro de la transacción— produciría invitaciones a usuarios que nunca
    //    llegaron a existir.
    let invitationSent = false;
    if (data.grantAccess && invitationToken) {
      try {
        await this.notifications.sendUserInvitation({
          email: email.value,
          firstName: name.firstName,
          invitedByName: actor.email,
          setPasswordToken: invitationToken.value,
          expiresAt: invitationExpiresAt,
        });
        invitationSent = true;
      } catch {
        invitationSent = false;
      }
    }

    await this.audit.record({
      actor: {
        userId: actor.userId,
        email: actor.email,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
      },
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        email: email.value,
        role: data.role,
        teamId,
        grantAccess: data.grantAccess,
        invitationSent,
      },
    });

    return ok({ userId: user.id, email: email.value, invitationSent });
  }
}

