/**
 * Puertos transversales.
 *
 * Son las dependencias que casi todo caso de uso necesita y que no deben ser
 * globales impuros (`new Date()`, `crypto.randomUUID()` sueltos): declararlas
 * como puertos hace los casos de uso deterministas y testeables sin mocks de
 * módulos.
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(): string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Unidad de trabajo: agrupa varias escrituras en una única transacción.
 * El caso de uso decide el límite transaccional; el repositorio no lo sabe.
 */
export interface UnitOfWork {
  run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}

/** Marcador opaco de transacción. Su forma real la conoce solo infraestructura. */
export interface TransactionContext {
  readonly _brand: 'TransactionContext';
}

export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
export const LOGGER = Symbol('Logger');
export const UNIT_OF_WORK = Symbol('UnitOfWork');
