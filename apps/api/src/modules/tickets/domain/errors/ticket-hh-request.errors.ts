import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@kora/core';

export class InvalidTicketHhRequestHoursError extends ValidationError {
  constructor() {
    super('Las horas deben estar entre 0 y 24.', 'TICKET_HH_REQUEST_INVALID_HOURS');
  }
}

export class TicketHhRequestNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Solicitud de HH', identifier, 'TICKET_HH_REQUEST_NOT_FOUND');
  }
}

export class TicketHhRequestNotPendingError extends ConflictError {
  constructor() {
    super('Esta solicitud ya fue revisada.', 'TICKET_HH_REQUEST_NOT_PENDING');
  }
}

export class TicketHhRequestRejectionReasonRequiredError extends ValidationError {
  constructor() {
    super('El motivo de rechazo es obligatorio.', 'TICKET_HH_REQUEST_REJECTION_REASON_REQUIRED');
  }
}

/** El ticket no tiene proyecto asociado — no hay contra qué registrar las horas. */
export class TicketProjectMissingForHhRequestError extends ConflictError {
  constructor() {
    super('El ticket no tiene un proyecto asociado.', 'TICKET_HH_REQUEST_PROJECT_MISSING');
  }
}

export class CannotSubmitTicketHhRequestError extends ForbiddenError {
  constructor() {
    super('No puedes solicitar horas en este ticket.', 'TICKET_HH_REQUEST_CANNOT_SUBMIT');
  }
}

/** Ni la v1 ni la v2 permiten autoaprobarse una solicitud — ver docs/DECISION-M5-TICKETS.md. */
export class CannotReviewOwnTicketHhRequestError extends ForbiddenError {
  constructor() {
    super('No puedes revisar tu propia solicitud.', 'TICKET_HH_REQUEST_CANNOT_REVIEW_OWN');
  }
}

export class CannotReviewTicketHhRequestError extends ForbiddenError {
  constructor() {
    super('No puedes revisar esta solicitud.', 'TICKET_HH_REQUEST_CANNOT_REVIEW');
  }
}

/** El ticket no tiene autorizadas horas extra — el líder del proyecto/equipo debe habilitarlo primero. */
export class TicketOvertimeNotAllowedError extends ConflictError {
  constructor() {
    super('Este ticket no tiene autorizadas horas extra.', 'TICKET_HH_REQUEST_OVERTIME_NOT_ALLOWED');
  }
}
