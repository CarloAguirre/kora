import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@kora/core';

export class InvalidTicketTitleError extends ValidationError {
  constructor(message: string) {
    super(message, 'TICKET_INVALID_TITLE');
  }
}

export class TicketNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Ticket', identifier, 'TICKET_NOT_FOUND');
  }
}

export class TicketAlreadyClosedError extends ConflictError {
  constructor() {
    super('Este ticket ya está cerrado.', 'TICKET_ALREADY_CLOSED');
  }
}

export class ReferencedClientNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Cliente', identifier, 'TICKET_CLIENT_NOT_FOUND');
  }
}

export class ReferencedProjectNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Proyecto', identifier, 'TICKET_PROJECT_NOT_FOUND');
  }
}

/** Un colaborador autoservido solo puede abrir tickets contra un proyecto con plan de soporte usable hoy. */
export class NoUsableSupportPlanError extends ConflictError {
  constructor() {
    super('Este proyecto no tiene un plan de soporte activo y usable hoy.', 'TICKET_NO_USABLE_SUPPORT_PLAN');
  }
}

/** El flujo de estados es forzado: solo se permite avanzar un paso a la vez. Ver docs/DECISION-M5-TICKETS.md. */
export class InvalidTicketStatusTransitionError extends ConflictError {
  constructor() {
    super('No puedes pasar el ticket directamente a ese estado.', 'TICKET_INVALID_STATUS_TRANSITION');
  }
}

export class TicketRequiresAssigneeError extends ConflictError {
  constructor() {
    super('Es necesario asignar un responsable para dar inicio al ticket.', 'TICKET_REQUIRES_ASSIGNEE');
  }
}

export class TicketResolutionRequiredError extends ConflictError {
  constructor() {
    super('Debes registrar la solución antes de marcar el ticket como terminado.', 'TICKET_RESOLUTION_REQUIRED');
  }
}

export class TicketHasPendingHhRequestsError extends ConflictError {
  constructor() {
    super('No puedes cerrar el ticket mientras tenga solicitudes de HH pendientes.', 'TICKET_HAS_PENDING_HH_REQUESTS');
  }
}

export class CannotDeleteTicketError extends ForbiddenError {
  constructor() {
    super('No puedes eliminar este ticket.', 'TICKET_CANNOT_DELETE');
  }
}
