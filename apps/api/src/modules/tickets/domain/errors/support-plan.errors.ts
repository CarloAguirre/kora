import { ConflictError, NotFoundError, ValidationError } from '@kora/core';

/** `CreateSupportProjectUseCase` solo acepta `type='support'` con `supportPlanType` presente — el mismo `.refine()` ya lo exige en el contrato, esto es defensa en profundidad. */
export class InvalidSupportProjectRequestError extends ValidationError {
  constructor() {
    super('Este endpoint solo crea proyectos de soporte con su contrato completo.', 'SUPPORT_PROJECT_INVALID_REQUEST');
  }
}

/** Un contrato de soporte siempre pertenece a un cliente — a diferencia de un proyecto de desarrollo, no puede quedar sin cliente. */
export class SupportPlanRequiresClientError extends ValidationError {
  constructor() {
    super('Un contrato de soporte debe tener un cliente.', 'SUPPORT_PLAN_REQUIRES_CLIENT');
  }
}

export class SupportPlanNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Contrato de soporte', identifier, 'SUPPORT_PLAN_NOT_FOUND');
  }
}

export class InvalidSupportPlanDateRangeError extends ValidationError {
  constructor() {
    super('La fecha de término no puede ser anterior a la fecha de inicio.', 'SUPPORT_PLAN_INVALID_DATE_RANGE');
  }
}

export class SupportPlanAlreadyClosedError extends ConflictError {
  constructor() {
    super('Este contrato ya está cerrado.', 'SUPPORT_PLAN_ALREADY_CLOSED');
  }
}

export class SupportPlanProjectNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Proyecto', identifier, 'SUPPORT_PLAN_PROJECT_NOT_FOUND');
  }
}

/** El override de contacto (`primary_contact_id`) debe ser un contacto del mismo cliente. */
export class SupportPlanContactNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Contacto', identifier, 'SUPPORT_PLAN_CONTACT_NOT_FOUND');
  }
}

/** Un contrato de soporte solo puede cubrir proyectos de desarrollo terminados — ver la corrección del usuario: el wizard no crea proyectos, vincula proyectos ya existentes. */
export class SupportPlanProjectNotEligibleError extends ConflictError {
  constructor(projectName: string) {
    super(
      `"${projectName}" no puede vincularse a un contrato de soporte: debe ser un proyecto de desarrollo terminado.`,
      'SUPPORT_PLAN_PROJECT_NOT_ELIGIBLE',
    );
  }
}

export class SupportPlanProjectClientMismatchError extends ConflictError {
  constructor(projectName: string) {
    super(`"${projectName}" pertenece a otro cliente.`, 'SUPPORT_PLAN_PROJECT_CLIENT_MISMATCH');
  }
}

export class SupportPlanProjectAlreadyLinkedError extends ConflictError {
  constructor(projectName: string) {
    super(`"${projectName}" ya está cubierto por otro contrato de soporte activo.`, 'SUPPORT_PLAN_PROJECT_ALREADY_LINKED');
  }
}

export class SupportInvoiceNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Factura de soporte', identifier, 'SUPPORT_INVOICE_NOT_FOUND');
  }
}

export class SupportInvoiceAlreadyExistsForPeriodError extends ConflictError {
  constructor(periodKey: string) {
    super(`Ya existe una factura para el período ${periodKey}.`, 'SUPPORT_INVOICE_ALREADY_EXISTS_FOR_PERIOD');
  }
}

/** No tiene sentido registrar una factura de un contrato que no debe nada este período — evita facturas "fantasma" con monto 0. */
export class SupportPlanNothingToInvoiceError extends ConflictError {
  constructor() {
    super('Este contrato no tiene un monto por facturar en el período actual.', 'SUPPORT_PLAN_NOTHING_TO_INVOICE');
  }
}

export class SupportInvoiceAlreadyPaidError extends ConflictError {
  constructor() {
    super('Esta factura ya está marcada como pagada.', 'SUPPORT_INVOICE_ALREADY_PAID');
  }
}
