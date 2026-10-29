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

/** Al dividir el total del período en varias facturas, sus montos tienen que sumar exactamente lo que corresponde facturar. */
export class SupportInvoiceSplitAmountMismatchError extends ValidationError {
  constructor(expected: number, actual: number, currency: string) {
    super(
      `Las facturas suman ${formatAmount(actual)} ${currency}, pero el monto a facturar del período es ${formatAmount(expected)} ${currency}.`,
      'SUPPORT_INVOICE_SPLIT_AMOUNT_MISMATCH',
    );
  }
}

function formatAmount(value: number): string {
  return value.toFixed(2);
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

/**
 * Una factura pagada ya movió dinero: anularla en Kora dejaría el pago sin
 * respaldo. Como las facturas de un período se anulan juntas, basta con que
 * una de ellas esté pagada (`paidFolio`, si no es la que se pidió anular).
 */
export class SupportInvoicePaidCannotBeVoidedError extends ConflictError {
  constructor(paidFolio?: string) {
    super(
      paidFolio
        ? `No se puede anular: el folio ${paidFolio} del mismo período ya está pagado, y las facturas de un período se anulan juntas.`
        : 'No se puede anular una factura que ya está pagada.',
      'SUPPORT_INVOICE_PAID_CANNOT_BE_VOIDED',
    );
  }
}
