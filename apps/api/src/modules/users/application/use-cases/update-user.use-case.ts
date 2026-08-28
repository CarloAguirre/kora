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
import type { RoleCode, UpdateUserInput } from '@kora/contracts';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';
import {
  EmailAlreadyInUseError,
  LastAdministratorError,
  TeamNotFoundError,
  UserNotFoundError,
} from '../../domain/errors/user.errors';
import { TeamAssignmentPolicy } from '../../domain/services/team-assignment.policy';
import { USER_REPOSITORY, type UserRepository } from '../../domain/repositories/user.repository';
import { TEAM_READER, type TeamReader } from '../ports/team-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { diffSnapshots } from '../../../../shared/infrastructure/audit/drizzle-audit-recorder';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';

export interface UpdateUserCommand {
  readonly userId: string;
  readonly data: UpdateUserInput;
  readonly actor: ActorContext;
}

/**
 * Edición de un usuario.
 *
 * Aplica solo los campos presentes en la entrada (semántica PATCH), y delega
 * cada regla en la entidad: es `User.changeRole` quien rechaza el autocambio de
 * rol, no este caso de uso. Aquí se orquesta y se comprueba lo que requiere
 * mirar fuera del agregado —unicidad del correo, existencia del equipo, que no
 * se quede el sistema sin administradores—, que es exactamente el reparto que
 * propone Clean Architecture.
 */
@Injectable()
export class UpdateUserUseCase implements UseCase<UpdateUserCommand, void, ApplicationError> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TEAM_READER) private readonly teams: TeamReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateUserCommand): Promise<Result<void, ApplicationError>> {
    const { userId, data, actor } = command;

    const user = await this.users.findById(userId);
    if (!user || user.isDeleted) return err(new UserNotFoundError(userId));

    const before = user.toSnapshot();
    const now = this.clock.now();

    // ── Nombre ────────────────────────────────────────────────────────────
    if (data.firstName !== undefined || data.lastName !== undefined) {
      const nameResult = PersonName.create(
        data.firstName ?? user.name.firstName,
        data.lastName ?? user.name.lastName,
      );
      if (nameResult.isErr()) return err(nameResult.error);
      user.rename(nameResult.value, now);
    }

    // ── Correo ────────────────────────────────────────────────────────────
    if (data.email !== undefined) {
      const emailResult = Email.create(data.email);
      if (emailResult.isErr()) return err(emailResult.error);

      if (!emailResult.value.equals(user.email)) {
        if (await this.users.emailIsTakenByAnother(emailResult.value, user.id)) {
          return err(new EmailAlreadyInUseError(emailResult.value.value));
        }
        user.changeEmail(emailResult.value, now);
      }
    }

    // ── Rol ───────────────────────────────────────────────────────────────
    // El orden importa: primero se comprueba que quede otro administrador, y
    // solo entonces se aplica el cambio.
    if (data.role !== undefined && data.role !== user.role) {
      const leavingAdminTier = isAdminRole(user.role) && !isAdminRole(data.role);
      if (leavingAdminTier) {
        const remaining = await this.users.countActiveAdminsExcluding(user.id);
        if (remaining === 0) return err(new LastAdministratorError());
      }

      const roleChange = user.changeRole(data.role as RoleCode, actor.userId, now);
      if (roleChange.isErr()) return err(roleChange.error);
    }

    // ── Equipo ────────────────────────────────────────────────────────────
    const nextTeamId =
      data.teamId !== undefined
        ? TeamAssignmentPolicy.normalizeTeamForRole(user.role, data.teamId ?? null)
        : TeamAssignmentPolicy.normalizeTeamForRole(user.role, user.teamId);

    if (nextTeamId !== user.teamId) {
      if (nextTeamId) {
        const team = await this.teams.findById(nextTeamId);
        if (!team) return err(new TeamNotFoundError(nextTeamId));
      }
      user.assignToTeam(nextTeamId, now);
    }

    const teamPolicy = TeamAssignmentPolicy.validate(user.role, user.teamId);
    if (teamPolicy.isErr()) return err(teamPolicy.error);

    // ── Responsable comercial ─────────────────────────────────────────────
    if (data.isCommercialManager !== undefined) {
      user.setCommercialManager(data.isCommercialManager, now);
    }

    const changes = diffSnapshots(before, user.toSnapshot());
    if (Object.keys(changes).length === 0) return ok(undefined);

    try {
      await this.unitOfWork.run((tx) => this.users.save(user, actor.userId, tx));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return err(new EmailAlreadyInUseError(user.email.value));
      }
      throw error;
    }

    await this.audit.record({
      actor: {
        userId: actor.userId,
        email: actor.email,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        requestId: actor.requestId ?? null,
      },
      action: changes.role ? 'role_change' : 'update',
      entityType: 'user',
      entityId: user.id,
      changes,
    });

    return ok(undefined);
  }
}

function isAdminRole(role: RoleCode | string): boolean {
  return role === 'admin' || role === 'pmo';
}
