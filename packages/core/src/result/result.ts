/**
 * Result<T, E> — resultado explícito de una operación que puede fallar.
 *
 * El dominio y los casos de uso NUNCA lanzan excepciones para errores de
 * negocio esperados: los devuelven. Las excepciones quedan reservadas para
 * fallos verdaderamente excepcionales (infraestructura caída, bugs).
 *
 * Esto hace que la firma de un caso de uso documente todos sus modos de fallo,
 * y obliga al llamador a tratarlos (no hay `catch` olvidado que los trague).
 */

export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly _tag = 'Ok' as const;

  constructor(public readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  /** Devuelve el valor, o lanza si es un error. Usar solo en tests o en bordes ya validados. */
  unwrap(): T {
    return this.value;
  }

  unwrapOr(_fallback: T): T {
    return this.value;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
}

export class Err<T, E> {
  readonly _tag = 'Err' as const;

  constructor(public readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  unwrap(): T {
    throw this.error instanceof Error
      ? this.error
      : new Error(`Se intentó desempaquetar un Result fallido: ${String(this.error)}`);
  }

  unwrapOr(fallback: T): T {
    return fallback;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }

  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return new Err<U, E>(this.error);
  }
}

export const ok = <T, E = never>(value: T): Result<T, E> => new Ok<T, E>(value);
export const err = <E, T = never>(error: E): Result<T, E> => new Err<T, E>(error);

/** Ok sin valor útil, para comandos que no devuelven nada. */
export const okVoid = <E = never>(): Result<void, E> => new Ok<void, E>(undefined);

/**
 * Combina varios Result en uno solo: Ok con todos los valores, o el primer Err.
 * Útil para validar varios value objects a la vez antes de construir una entidad.
 */
export function combine<T, E>(results: Array<Result<T, E>>): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (result.isErr()) return err(result.error);
    values.push(result.value);
  }
  return ok(values);
}
