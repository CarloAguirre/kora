import { ConflictError, DomainError, NotFoundError, ValidationError } from '@kora/core';

export class HourEntryNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Registro de horas', identifier, 'HOUR_ENTRY_NOT_FOUND');
  }
}

export class InvalidHourEntryHoursError extends ValidationError {
  constructor(message: string) {
    super(message, 'HOUR_ENTRY_INVALID_HOURS');
  }
}

/** `Proyecto`/`Prospecto` exigen un proyecto asociado. */
export class ProjectRequiredForAssignmentError extends DomainError {
  constructor() {
    super('HOUR_ENTRY_PROJECT_REQUIRED', 'Esta asignación requiere seleccionar un proyecto.');
  }
}

/** El resto de asignaciones (Vacaciones, Capacitación...) no admiten proyecto. */
export class ProjectNotAllowedForAssignmentError extends DomainError {
  constructor() {
    super('HOUR_ENTRY_PROJECT_NOT_ALLOWED', 'Esta asignación no admite proyecto.');
  }
}

/**
 * Un colaborador registrando horas sin proyecto debe designar a un líder que
 * las apruebe — ver docs/DECISION-M4-HORAS.md.
 */
export class DesignatedApproverRequiredError extends DomainError {
  constructor() {
    super('HOUR_ENTRY_DESIGNATED_APPROVER_REQUIRED', 'Selecciona un líder aprobador para esta asignación.');
  }
}

export class DesignatedApproverNotAllowedError extends DomainError {
  constructor() {
    super(
      'HOUR_ENTRY_DESIGNATED_APPROVER_NOT_ALLOWED',
      'Las horas de proyecto no llevan aprobador designado: se aprueban por acceso al proyecto.',
    );
  }
}

export class InvalidDesignatedApproverError extends ValidationError {
  constructor() {
    super('El aprobador designado debe ser un líder o PMO habilitado.', 'HOUR_ENTRY_INVALID_DESIGNATED_APPROVER');
  }
}

export class InvalidHourEntryStatusTransitionError extends ConflictError {
  constructor(from: string) {
    super(`No se puede aprobar/rechazar un registro en estado "${from}".`, 'HOUR_ENTRY_INVALID_STATUS_TRANSITION', {
      details: { from },
    });
  }
}

/** Un registro aprobado ya afectó el consumo del proyecto: solo un admin puede tocarlo, y por otra vía. */
export class HourEntryNotEditableError extends ConflictError {
  constructor() {
    super('Un registro aprobado no se puede editar directamente.', 'HOUR_ENTRY_NOT_EDITABLE');
  }
}

/** Fuera del mes en curso el registro ya se reportó/facturó: no se edita ni se elimina. */
export class HourEntryOutsideCurrentMonthError extends ConflictError {
  constructor() {
    super('Solo se pueden editar o eliminar registros del mes en curso.', 'HOUR_ENTRY_OUTSIDE_CURRENT_MONTH');
  }
}

export class RejectionReasonRequiredError extends ValidationError {
  constructor() {
    super('Indica el motivo del rechazo.', 'HOUR_ENTRY_REJECTION_REASON_REQUIRED');
  }
}

export class ReferencedProjectNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Proyecto', identifier, 'HOUR_ENTRY_PROJECT_NOT_FOUND');
  }
}

export class ReferencedModuleNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Módulo', identifier, 'HOUR_ENTRY_MODULE_NOT_FOUND');
  }
}

/** El módulo elegido pertenece a otro proyecto — no tiene sentido imputar la hora ahí. */
export class ModuleNotInProjectError extends DomainError {
  constructor() {
    super('HOUR_ENTRY_MODULE_NOT_IN_PROJECT', 'El módulo elegido no pertenece a este proyecto.');
  }
}

export class ProjectStoppedError extends ConflictError {
  constructor() {
    super('No se pueden registrar horas en un proyecto detenido.', 'HOUR_ENTRY_PROJECT_STOPPED');
  }
}

/** El proyecto no tiene autorizadas horas extra — el líder del proyecto/equipo debe habilitarlo primero. */
export class ProjectOvertimeNotAllowedError extends ConflictError {
  constructor() {
    super('Este proyecto no tiene autorizadas horas extra.', 'HOUR_ENTRY_PROJECT_OVERTIME_NOT_ALLOWED');
  }
}
