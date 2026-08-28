import { ConflictError, DomainError, NotFoundError, ValidationError } from '@kora/core';

export class InvalidTeamNameError extends ValidationError {
  constructor(message: string) {
    super(message, 'TEAM_INVALID_NAME');
  }
}

export class TeamNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Equipo', identifier, 'TEAM_NOT_FOUND');
  }
}

export class TeamNameAlreadyInUseError extends ConflictError {
  constructor(name: string) {
    super(`Ya existe un equipo llamado "${name}".`, 'TEAM_NAME_ALREADY_IN_USE', { details: { name } });
  }
}

export class TeamMemberAlreadyActiveError extends ConflictError {
  constructor() {
    super('Esta persona ya pertenece activamente al equipo.', 'TEAM_MEMBER_ALREADY_ACTIVE');
  }
}

export class TeamMemberNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Miembro de equipo', identifier, 'TEAM_MEMBER_NOT_FOUND');
  }
}

export class InvalidWeeklyHoursError extends ValidationError {
  constructor(message: string) {
    super(message, 'TEAM_INVALID_WEEKLY_HOURS');
  }
}

export class TeamAlreadyDeletedError extends ConflictError {
  constructor() {
    super('El equipo ya fue eliminado.', 'TEAM_ALREADY_DELETED');
  }
}

/** Un equipo con miembros activos no se puede eliminar sin retirarlos antes. */
export class TeamHasActiveMembersError extends DomainError {
  constructor(memberCount: number) {
    super(
      'TEAM_HAS_ACTIVE_MEMBERS',
      `El equipo tiene ${memberCount} miembro(s) activo(s). Retíralos antes de eliminarlo.`,
      { details: { memberCount } },
    );
  }
}
