import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida y transforma la entrada con el mismo esquema Zod que usa el front.
 *
 * Se prefiere a `class-validator` porque el esquema vive en `@kora/contracts` y
 * lo comparten cliente y servidor: es imposible que el formulario acepte algo
 * que la API rechace, o al revés. Además Zod devuelve el valor ya parseado y
 * tipado, así que el controlador recibe datos limpios, no un `any` decorado.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    // El ZodError que se lance aquí lo formatea AllExceptionsFilter.
    return this.schema.parse(value);
  }
}

/** Azúcar para usarlo en los parámetros del controlador. */
export const zodPipe = <T>(schema: ZodType<T>): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);
