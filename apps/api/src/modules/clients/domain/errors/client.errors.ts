import { ConflictError, DomainError, NotFoundError, ValidationError } from '@kora/core';

/** Errores del dominio de clientes, cada uno con su código estable. */

export class InvalidTaxIdError extends ValidationError {
  constructor(message: string) {
    super(message, 'CLIENT_INVALID_TAX_ID');
  }
}

export class ClientNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('Cliente', identifier, 'CLIENT_NOT_FOUND');
  }
}

export class TaxIdAlreadyInUseError extends ConflictError {
  constructor(taxId: string) {
    super(`Ya existe un cliente con el RUT ${taxId}.`, 'CLIENT_TAX_ID_ALREADY_IN_USE', {
      details: { taxId },
    });
  }
}

/**
 * Desactivar un cliente con proyectos activos exige confirmación explícita.
 *
 * En la v1 esto ocurría en silencio: un trigger (`trg_finalize_projects_when_client_inactive`)
 * finalizaba los proyectos sin que nadie en la interfaz lo supiera. Aquí el
 * caso de uso se niega a hacerlo hasta que el llamador confirme que entiende el
 * efecto, y ese consentimiento queda en la auditoría.
 */
export class ClientDeactivationRequiresConfirmationError extends DomainError {
  constructor(activeProjectCount: number) {
    super(
      'CLIENT_DEACTIVATION_REQUIRES_CONFIRMATION',
      `Este cliente tiene ${activeProjectCount} proyecto(s) activo(s). Desactivarlo los finalizará. Confirma para continuar.`,
      { details: { activeProjectCount } },
    );
  }
}

export class ClientAlreadyDeletedError extends ConflictError {
  constructor() {
    super('El cliente ya fue eliminado.', 'CLIENT_ALREADY_DELETED');
  }
}
