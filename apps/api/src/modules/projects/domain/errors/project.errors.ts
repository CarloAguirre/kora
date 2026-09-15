import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@kora/core';

export class InvalidProjectNameError extends ValidationError {
  constructor(message: string) {
    super(message, 'PROJECT_INVALID_NAME');
  }
}

export class ProjectNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Proyecto', identifier, 'PROJECT_NOT_FOUND');
  }
}

export class ProjectNameAlreadyInUseError extends ConflictError {
  constructor(name: string) {
    super(`Ya existe un proyecto llamado "${name}" para este cliente.`, 'PROJECT_NAME_ALREADY_IN_USE', {
      details: { name },
    });
  }
}

/** La etapa comercial (`salesStage`) solo tiene sentido en proyectos de desarrollo. */
export class SalesStageNotAllowedForSupportError extends DomainError {
  constructor() {
    super(
      'PROJECT_SALES_STAGE_NOT_ALLOWED',
      'Los proyectos de soporte no tienen etapa comercial.',
    );
  }
}

export class SalesStageRequiredForDevelopmentError extends DomainError {
  constructor() {
    super(
      'PROJECT_SALES_STAGE_REQUIRED',
      'Los proyectos de desarrollo requieren una etapa comercial.',
    );
  }
}

export class ProjectAlreadyDeletedError extends ConflictError {
  constructor() {
    super('El proyecto ya fue eliminado.', 'PROJECT_ALREADY_DELETED');
  }
}

export class ProjectTeamMemberNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Miembro asignado', identifier, 'PROJECT_TEAM_MEMBER_NOT_FOUND');
  }
}

export class ProjectTeamMemberAlreadyAssignedError extends ConflictError {
  constructor() {
    super('Esta persona ya está asignada al proyecto.', 'PROJECT_TEAM_MEMBER_ALREADY_ASSIGNED');
  }
}

export class InvalidTeamMemberAssignmentError extends ValidationError {
  constructor() {
    super('La persona indicada no es un miembro de equipo activo.', 'PROJECT_INVALID_TEAM_MEMBER');
  }
}

/**
 * Cliente inexistente al asignarlo a un proyecto.
 *
 * Es un error PROPIO del módulo de proyectos, no el de `clients`: cada módulo
 * describe sus fallos en sus propios términos, aunque la causa de fondo sea la
 * misma. Reutilizar la clase de otro módulo acoplaría los dos dominios por una
 * coincidencia de vocabulario que podría dejar de serlo.
 */
export class ReferencedClientNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Cliente', identifier, 'PROJECT_CLIENT_NOT_FOUND');
  }
}

export class ProjectObservationNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Observación', identifier, 'PROJECT_OBSERVATION_NOT_FOUND');
  }
}

export class ProjectModuleNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Fase/módulo', identifier, 'PROJECT_MODULE_NOT_FOUND');
  }
}

export class ProjectModuleDeliveryNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Entrega', identifier, 'PROJECT_MODULE_DELIVERY_NOT_FOUND');
  }
}

export class ProjectModuleSegmentNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Tramo', identifier, 'PROJECT_MODULE_SEGMENT_NOT_FOUND');
  }
}

export class ProjectModuleTaskNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Tarea', identifier, 'PROJECT_MODULE_TASK_NOT_FOUND');
  }
}

/** Autorizar horas extra en un proyecto es una decisión de líder — ni `projects:manage` por sí solo ni ser un miembro cualquiera bastan. */
export class CannotAuthorizeProjectOvertimeError extends ForbiddenError {
  constructor() {
    super('No tienes permiso para autorizar horas extra en este proyecto.', 'PROJECT_CANNOT_AUTHORIZE_OVERTIME');
  }
}

/** Mismo criterio que `CannotAuthorizeProjectOvertimeError` — editar la pestaña "Extras" de un proyecto es una decisión de líder, no de cualquier miembro. */
export class CannotEditProjectExtrasError extends ForbiddenError {
  constructor() {
    super('No tienes permiso para editar los datos de "Extras" de este proyecto.', 'PROJECT_CANNOT_EDIT_EXTRAS');
  }
}
