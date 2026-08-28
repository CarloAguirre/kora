import { ForbiddenError, NotFoundError, ValidationError } from '@kora/core';

export class InvalidForecastPeriodError extends ValidationError {
  constructor(message: string) {
    super(message, 'FORECAST_INVALID_PERIOD');
  }
}

export class InvalidForecastHoursError extends ValidationError {
  constructor(message: string) {
    super(message, 'FORECAST_INVALID_HOURS');
  }
}

export class ForecastAssignmentNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Asignación de forecast', identifier, 'FORECAST_ASSIGNMENT_NOT_FOUND');
  }
}

export class ReferencedTeamMemberNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Miembro de equipo', identifier, 'FORECAST_TEAM_MEMBER_NOT_FOUND');
  }
}

export class ReferencedClientNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Cliente', identifier, 'FORECAST_CLIENT_NOT_FOUND');
  }
}

export class ReferencedProjectNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Proyecto', identifier, 'FORECAST_PROJECT_NOT_FOUND');
  }
}

/** Solo admin, PMO o quien lidera el equipo del miembro puede tocar su forecast. */
export class ForbiddenForecastAccessError extends ForbiddenError {
  constructor() {
    super('No tienes permiso para modificar el forecast de este equipo.', 'FORECAST_FORBIDDEN');
  }
}
