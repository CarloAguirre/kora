import { ConflictError, DomainError, NotFoundError, ValidationError } from '@kora/core';
import type { UserStatus } from '@kora/contracts';

/**
 * Errores del dominio de usuarios.
 *
 * Cada uno lleva un código estable que el front puede tratar sin leer el
 * mensaje. Los mensajes son para personas y pueden reescribirse; los códigos
 * son el contrato y no cambian.
 */

export class InvalidEmailError extends ValidationError {
  constructor(message: string) {
    super(message, 'USER_INVALID_EMAIL');
  }
}

export class InvalidPersonNameError extends ValidationError {
  constructor(message: string) {
    super(message, 'USER_INVALID_NAME');
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Usuario', identifier, 'USER_NOT_FOUND');
  }
}

export class EmailAlreadyInUseError extends ConflictError {
  constructor(email: string) {
    super(`Ya existe un usuario con el correo ${email}.`, 'USER_EMAIL_ALREADY_IN_USE', {
      details: { email },
    });
  }
}

export class InvalidStatusTransitionError extends DomainError {
  constructor(from: UserStatus, to: UserStatus, reason: string) {
    super('USER_INVALID_STATUS_TRANSITION', reason, { details: { from, to } });
  }
}

/**
 * Nadie puede cambiar su propio rol ni su propio estado.
 *
 * En la v1 esto se defendía con dos triggers de Postgres
 * (`prevent_self_usuario_role_update`, `prevent_self_profile_status_update`),
 * invisibles desde el código y difíciles de probar. Es una regla de negocio y
 * ahora vive en el dominio, con su test.
 */
export class SelfAuthorizationChangeError extends DomainError {
  constructor(what: 'rol' | 'estado' | 'cuenta') {
    super(
      'USER_SELF_AUTHORIZATION_CHANGE',
      `No puedes modificar tu propio ${what}. Pídeselo a otro administrador.`,
    );
  }
}

export class LastAdministratorError extends DomainError {
  constructor() {
    super(
      'USER_LAST_ADMINISTRATOR',
      'No se puede dejar el sistema sin administradores activos. Asigna otro administrador antes de continuar.',
    );
  }
}

export class TeamRequiredForRoleError extends DomainError {
  constructor(roleLabel: string) {
    super('USER_TEAM_REQUIRED', `El rol ${roleLabel} exige un equipo asignado.`);
  }
}

export class TeamNotAllowedForRoleError extends DomainError {
  constructor(roleLabel: string) {
    super('USER_TEAM_NOT_ALLOWED', `El rol ${roleLabel} no admite un equipo asignado.`);
  }
}

export class TeamNotFoundError extends NotFoundError {
  constructor(teamId: string) {
    super('Equipo', teamId, 'TEAM_NOT_FOUND');
  }
}

export class UserAlreadyDeletedError extends ConflictError {
  constructor() {
    super('El usuario ya fue eliminado.', 'USER_ALREADY_DELETED');
  }
}
