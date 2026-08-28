/**
 * Jerarquía de errores de aplicación.
 *
 * Un error de negocio lleva su propio `code` estable (contrato con el front) y
 * una `kind` que la capa HTTP traduce a un status. El dominio no conoce HTTP:
 * nunca aparece un 404 ni un 409 dentro de una entidad o un caso de uso.
 */

export type ErrorKind =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'unprocessable'
  | 'rate_limited'
  | 'internal';

export interface ApplicationErrorOptions {
  /** Datos estructurados para que el front pueda reaccionar sin parsear textos. */
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

export abstract class ApplicationError extends Error {
  abstract readonly kind: ErrorKind;
  abstract readonly code: string;

  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, options: ApplicationErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON(): { code: string; kind: ErrorKind; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      kind: this.kind,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Una regla de negocio invariante fue violada. */
export class DomainError extends ApplicationError {
  readonly kind: ErrorKind = 'unprocessable';

  constructor(
    readonly code: string,
    message: string,
    options?: ApplicationErrorOptions,
  ) {
    super(message, options);
  }
}

/** Los datos de entrada no cumplen el formato esperado. */
export class ValidationError extends ApplicationError {
  readonly kind: ErrorKind = 'validation';
  readonly code: string;

  constructor(message: string, code = 'VALIDATION_ERROR', options?: ApplicationErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** El recurso solicitado no existe (o el solicitante no puede saber que existe). */
export class NotFoundError extends ApplicationError {
  readonly kind: ErrorKind = 'not_found';
  readonly code: string;

  constructor(resource: string, identifier?: string | number, code?: string) {
    super(
      identifier === undefined
        ? `${resource} no encontrado.`
        : `${resource} no encontrado: ${identifier}.`,
      { details: { resource, ...(identifier !== undefined ? { identifier } : {}) } },
    );
    this.code = code ?? 'NOT_FOUND';
  }
}

/** El estado actual del sistema impide la operación (duplicados, carreras). */
export class ConflictError extends ApplicationError {
  readonly kind: ErrorKind = 'conflict';
  readonly code: string;

  constructor(message: string, code = 'CONFLICT', options?: ApplicationErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** No hay identidad probada: falta credencial o es inválida. */
export class UnauthorizedError extends ApplicationError {
  readonly kind: ErrorKind = 'unauthorized';
  readonly code: string;

  constructor(message = 'No autenticado.', code = 'UNAUTHORIZED', options?: ApplicationErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** Hay identidad probada, pero no alcanza para esta operación. */
export class ForbiddenError extends ApplicationError {
  readonly kind: ErrorKind = 'forbidden';
  readonly code: string;

  constructor(message = 'No autorizado.', code = 'FORBIDDEN', options?: ApplicationErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** Demasiadas solicitudes en poco tiempo. */
export class RateLimitError extends ApplicationError {
  readonly kind: ErrorKind = 'rate_limited';
  readonly code: string;

  constructor(message: string, readonly retryAfterSeconds: number, code = 'RATE_LIMITED') {
    super(message, { details: { retryAfterSeconds } });
    this.code = code;
  }
}

/** Fallo no previsto de infraestructura. Nunca se expone su mensaje al cliente. */
export class InfrastructureError extends ApplicationError {
  readonly kind: ErrorKind = 'internal';
  readonly code: string;

  constructor(message: string, code = 'INTERNAL_ERROR', options?: ApplicationErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
