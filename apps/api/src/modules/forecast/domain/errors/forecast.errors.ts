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

/** Tipo, cliente y proyecto de una fila calculada vienen del tramo o la tarea que la generó. */
export class ForecastCalculatedRowLockedError extends ValidationError {
  constructor() {
    super('Esta fila se calcula desde el proyecto: solo puedes cambiar sus HH y comentarios.', 'FORECAST_CALCULATED_ROW_LOCKED');
  }
}

/** Si se borrara, el próximo cálculo la volvería a crear — el líder la deja en 0 HH si no corresponde. */
export class ForecastCalculatedRowNotDeletableError extends ValidationError {
  constructor() {
    super('Las filas calculadas no se eliminan: deja sus HH en 0 si esa semana no corresponde.', 'FORECAST_CALCULATED_ROW_NOT_DELETABLE');
  }
}

export class ForecastRowNotCalculatedError extends ValidationError {
  constructor() {
    super('Esta fila se cargó a mano: no tiene un cálculo al que volver.', 'FORECAST_ROW_NOT_CALCULATED');
  }
}

/** Solo admin, PMO o quien lidera el equipo del miembro puede tocar su forecast. */
export class ForbiddenForecastAccessError extends ForbiddenError {
  constructor() {
    super('No tienes permiso para modificar el forecast de este equipo.', 'FORECAST_FORBIDDEN');
  }
}
